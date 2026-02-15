import { Response } from "express";
import { Task } from "../models/Task";
import { TaskInstance } from "../models/TaskInstance";
import { Question } from "../models/Question";
import { AuthRequest } from "../types/auth";
import { TaskStatus } from "../types/task";
import { TaskInstanceStatus } from "../types/taskInstance";
import { isTaskOnDate, getDayRange } from "../utils/recurrence";

// ---- CRUD ----

export const createTask = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const {
      name,
      category,
      targetQuestionCount,
      isRecurring,
      recurrence,
      endDate,
    } = req.body;

    const task = await Task.create({
      name,
      userId,
      category,
      targetQuestionCount,
      isRecurring,
      recurrence,
      endDate,
    });

    // For one-time tasks, immediately create a TaskInstance
    if (!isRecurring) {
      const startDate = recurrence?.startDate
        ? new Date(recurrence.startDate)
        : new Date();
      const normalized = new Date(startDate);
      normalized.setHours(0, 0, 0, 0);

      await TaskInstance.create({
        task: task._id,
        userId,
        date: normalized,
        taskName: task.name,
        category: task.category,
        targetQuestionCount: task.targetQuestionCount,
        addedQuestionCount: 0,
        solvedQuestionCount: 0,
        status: TaskInstanceStatus.Pending,
      });
    }

    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ message: "Error creating task", error });
  }
};

export const getAllTasks = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const filter: Record<string, any> = { userId };

    if (req.query.category) filter.category = req.query.category as string;
    if (req.query.status) filter.status = req.query.status as string;
    if (req.query.isRecurring !== undefined) {
      filter.isRecurring = req.query.isRecurring === "true";
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [tasks, total] = await Promise.all([
      Task.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Task.countDocuments(filter),
    ]);

    res.status(200).json({
      tasks,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching tasks", error });
  }
};

export const getTaskById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const task = await Task.findOne({ _id: req.params.id, userId });

    if (!task) {
      res.status(404).json({ message: "Task not found" });
      return;
    }

    res.status(200).json(task);
  } catch (error) {
    res.status(500).json({ message: "Error fetching task", error });
  }
};

export const updateTask = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const {
      name,
      category,
      targetQuestionCount,
      isRecurring,
      recurrence,
      endDate,
    } = req.body;

    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, userId },
      { name, category, targetQuestionCount, isRecurring, recurrence, endDate },
      { new: true, runValidators: true }
    );

    if (!task) {
      res.status(404).json({ message: "Task not found" });
      return;
    }

    res.status(200).json(task);
  } catch (error) {
    res.status(500).json({ message: "Error updating task", error });
  }
};

export const deleteTask = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const task = await Task.findOneAndDelete({ _id: req.params.id, userId });

    if (!task) {
      res.status(404).json({ message: "Task not found" });
      return;
    }

    // Clean up all instances and questions
    const instances = await TaskInstance.find({ task: task._id, userId });
    const instanceIds = instances.map((i) => i._id);

    await Promise.all([
      TaskInstance.deleteMany({ task: task._id, userId }),
      Question.deleteMany({ task: task._id, userId }),
    ]);

    res.status(200).json({ message: "Task deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting task", error });
  }
};

// ---- Scheduling ----

/**
 * Materializes TaskInstances for the given date and returns them with questions.
 */
const materializeInstancesForDate = async (userId: string, date: Date) => {
  const { start, end } = getDayRange(date);

  // 1. Get already-materialized instances for this date
  const existingInstances = await TaskInstance.find({
    userId,
    date: { $gte: start, $lte: end },
  });

  const materializedTaskIds = new Set(
    existingInstances.map((i) => i.task.toString())
  );

  // 2. Find active recurring tasks that should fire today
  const recurringTasks = await Task.find({
    userId,
    isRecurring: true,
    status: TaskStatus.Active,
    "recurrence.startDate": { $lte: end },
    $or: [
      { endDate: { $exists: false } },
      { endDate: null },
      { endDate: { $gte: start } },
    ],
  });

  // 3. Materialize missing instances
  const newInstances = [];
  for (const task of recurringTasks) {
    if (materializedTaskIds.has(task._id.toString())) continue;
    if (!isTaskOnDate(task, date)) continue;

    const instance = await TaskInstance.findOneAndUpdate(
      {
        task: task._id,
        userId,
        date: { $gte: start, $lte: end },
      },
      {
        $setOnInsert: {
          task: task._id,
          userId,
          date: new Date(start),
          taskName: task.name,
          category: task.category,
          targetQuestionCount: task.targetQuestionCount,
          addedQuestionCount: 0,
          solvedQuestionCount: 0,
          status: TaskInstanceStatus.Pending,
        },
      },
      { upsert: true, new: true }
    );
    newInstances.push(instance);
  }

  // 4. Combine all instances
  const allInstances = [...existingInstances, ...newInstances];

  // 5. Fetch questions for all instances
  const instanceIds = allInstances.map((i) => i._id);
  const questions = await Question.find({ taskInstance: { $in: instanceIds } });

  const questionsByInstance = new Map<string, typeof questions>();
  for (const q of questions) {
    const key = q.taskInstance!.toString();
    if (!questionsByInstance.has(key)) questionsByInstance.set(key, []);
    questionsByInstance.get(key)!.push(q);
  }

  // 6. Build response grouped by category
  const groupMap = new Map<string, { category: string; instances: any[] }>();

  for (const instance of allInstances) {
    const cat = instance.category || "unknown";
    if (!groupMap.has(cat)) groupMap.set(cat, { category: cat, instances: [] });
    groupMap.get(cat)!.instances.push({
      ...instance.toObject(),
      questions: questionsByInstance.get(instance._id.toString()) || [],
    });
  }

  const groups = Array.from(groupMap.values()).map((group) => ({
    category: group.category,
    summary: {
      total: group.instances.length,
      completed: group.instances.filter((i) => i.status === TaskInstanceStatus.Completed).length,
      incomplete: group.instances.filter((i) => i.status === TaskInstanceStatus.Incomplete).length,
      in_progress: group.instances.filter((i) => i.status === TaskInstanceStatus.InProgress).length,
      pending: group.instances.filter((i) => i.status === TaskInstanceStatus.Pending).length,
    },
    instances: group.instances,
  }));

  const overall = {
    total: allInstances.length,
    completed: allInstances.filter((i) => i.status === TaskInstanceStatus.Completed).length,
    incomplete: allInstances.filter((i) => i.status === TaskInstanceStatus.Incomplete).length,
    in_progress: allInstances.filter((i) => i.status === TaskInstanceStatus.InProgress).length,
    pending: allInstances.filter((i) => i.status === TaskInstanceStatus.Pending).length,
  };

  return { summary: overall, groups };
};

export const getToday = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const today = new Date();
    const result = await materializeInstancesForDate(userId, today);

    res.status(200).json({
      date: today.toISOString().split("T")[0],
      ...result,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching today's tasks", error });
  }
};

export const getHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    // Single date query
    if (req.query.date) {
      const date = new Date(req.query.date as string);
      const result = await materializeInstancesForDate(userId, date);
      res.status(200).json({
        date: date.toISOString().split("T")[0],
        ...result,
      });
      return;
    }

    // Date range query
    if (req.query.from && req.query.to) {
      const from = new Date(req.query.from as string);
      const to = new Date(req.query.to as string);
      const { start: rangeStart } = getDayRange(from);
      const { end: rangeEnd } = getDayRange(to);

      // Batch query all instances in the range
      const instances = await TaskInstance.find({
        userId,
        date: { $gte: rangeStart, $lte: rangeEnd },
      });

      // Fetch all questions for these instances
      const instanceIds = instances.map((i) => i._id);
      const questions = await Question.find({ taskInstance: { $in: instanceIds } });

      const questionsByInstance = new Map<string, typeof questions>();
      for (const q of questions) {
        const key = q.taskInstance!.toString();
        if (!questionsByInstance.has(key)) questionsByInstance.set(key, []);
        questionsByInstance.get(key)!.push(q);
      }

      // Group instances by date
      const dayMap = new Map<string, any[]>();
      for (const instance of instances) {
        const dateStr = instance.date.toISOString().split("T")[0];
        if (!dayMap.has(dateStr)) dayMap.set(dateStr, []);
        dayMap.get(dateStr)!.push({
          ...instance.toObject(),
          questions: questionsByInstance.get(instance._id.toString()) || [],
        });
      }

      // Build response for each day
      const days: Array<{ date: string; summary: any; groups: any }> = [];
      const current = new Date(from);
      current.setHours(0, 0, 0, 0);
      const endDate = new Date(to);
      endDate.setHours(0, 0, 0, 0);

      while (current <= endDate) {
        const dateStr = current.toISOString().split("T")[0];
        const dayInstances = dayMap.get(dateStr) || [];

        const summary = {
          total: dayInstances.length,
          completed: dayInstances.filter((i) => i.status === TaskInstanceStatus.Completed).length,
          incomplete: dayInstances.filter((i) => i.status === TaskInstanceStatus.Incomplete).length,
          in_progress: dayInstances.filter((i) => i.status === TaskInstanceStatus.InProgress).length,
          pending: dayInstances.filter((i) => i.status === TaskInstanceStatus.Pending).length,
        };

        days.push({ date: dateStr, summary, groups: dayInstances });
        current.setDate(current.getDate() + 1);
      }

      res.status(200).json({
        from: from.toISOString().split("T")[0],
        to: to.toISOString().split("T")[0],
        days,
      });
      return;
    }

    res.status(400).json({ message: "Provide ?date= or ?from=&to= query parameters" });
  } catch (error) {
    res.status(500).json({ message: "Error fetching task history", error });
  }
};

// ---- Instance detail ----

export const getInstanceById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const instance = await TaskInstance.findOne({ _id: req.params.id, userId });

    if (!instance) {
      res.status(404).json({ message: "Task instance not found" });
      return;
    }

    const questions = await Question.find({ taskInstance: instance._id });

    res.status(200).json({
      ...instance.toObject(),
      questions,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching task instance", error });
  }
};
