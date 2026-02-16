import { Response } from "express";
import { Task } from "../models/Task";
import { DailyTask } from "../models/DailyTask";
import { Question } from "../models/Question";
import { AuthRequest } from "../types/auth";
import { TaskStatus } from "../types/task";
import { DailyTaskStatus } from "../types/dailyTask";
import { isTaskOnDate, getDayRange, toISTDateString, toISTMidnight } from "../utils/recurrence";

const computeSummary = (items: Array<{ status: string }>) => {
  const summary = { total: items.length, completed: 0, incomplete: 0, in_progress: 0, pending: 0 };
  for (const item of items) {
    if (item.status === DailyTaskStatus.Completed) summary.completed++;
    else if (item.status === DailyTaskStatus.Incomplete) summary.incomplete++;
    else if (item.status === DailyTaskStatus.InProgress) summary.in_progress++;
    else summary.pending++;
  }
  return summary;
};

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

    // For one-time tasks, immediately create a DailyTask
    if (!isRecurring) {
      const startDate = recurrence?.startDate
        ? new Date(recurrence.startDate)
        : new Date();
      const normalized = toISTMidnight(startDate);

      await DailyTask.create({
        task: task._id,
        userId,
        date: normalized,
        taskName: task.name,
        category: task.category,
        targetQuestionCount: task.targetQuestionCount,
        addedQuestionCount: 0,
        solvedQuestionCount: 0,
        status: DailyTaskStatus.Pending,
      });
    }

    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ message: "Error creating task" });
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
    res.status(500).json({ message: "Error fetching tasks" });
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
    res.status(500).json({ message: "Error fetching task" });
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
    res.status(500).json({ message: "Error updating task" });
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

    // Clean up all daily tasks and questions
    await Promise.all([
      DailyTask.deleteMany({ task: task._id, userId }),
      Question.deleteMany({ task: task._id, userId }),
    ]);

    res.status(200).json({ message: "Task deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting task" });
  }
};

// ---- Scheduling ----

/**
 * Materializes DailyTasks for the given date and returns them with questions.
 */
const materializeDailyTasksForDate = async (userId: string, date: Date) => {
  const { start, end } = getDayRange(date);

  // 1. Get already-materialized daily tasks for this date
  const existingDailyTasks = await DailyTask.find({
    userId,
    date: { $gte: start, $lte: end },
  });

  const materializedTaskIds = new Set(
    existingDailyTasks.map((i) => i.task.toString())
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

  // 3. Materialize missing daily tasks
  const newDailyTasks = [];
  for (const task of recurringTasks) {
    if (materializedTaskIds.has(task._id.toString())) continue;
    if (!isTaskOnDate(task, date)) continue;

    const dailyTask = await DailyTask.findOneAndUpdate(
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
          status: DailyTaskStatus.Pending,
        },
      },
      { upsert: true, new: true }
    );
    newDailyTasks.push(dailyTask);
  }

  // 4. Combine all daily tasks
  const allDailyTasks = [...existingDailyTasks, ...newDailyTasks];

  // 5. Fetch questions for all daily tasks
  const dailyTaskIds = allDailyTasks.map((i) => i._id);
  const questions = await Question.find({ dailyTask: { $in: dailyTaskIds } });

  const questionsByDailyTask = new Map<string, typeof questions>();
  for (const q of questions) {
    const key = q.dailyTask!.toString();
    if (!questionsByDailyTask.has(key)) questionsByDailyTask.set(key, []);
    questionsByDailyTask.get(key)!.push(q);
  }

  // 6. Build response grouped by category
  const groupMap = new Map<string, { category: string; dailyTasks: any[] }>();

  for (const dailyTask of allDailyTasks) {
    const cat = dailyTask.category || "unknown";
    if (!groupMap.has(cat)) groupMap.set(cat, { category: cat, dailyTasks: [] });
    groupMap.get(cat)!.dailyTasks.push({
      ...dailyTask.toObject(),
      questions: questionsByDailyTask.get(dailyTask._id.toString()) || [],
    });
  }

  const groups = Array.from(groupMap.values()).map((group) => ({
    category: group.category,
    summary: computeSummary(group.dailyTasks),
    dailyTasks: group.dailyTasks,
  }));

  return { summary: computeSummary(allDailyTasks), groups };
};

export const getToday = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const today = new Date();
    const result = await materializeDailyTasksForDate(userId, today);

    res.status(200).json({
      date: toISTDateString(today),
      ...result,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching today's tasks" });
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
      const result = await materializeDailyTasksForDate(userId, date);
      res.status(200).json({
        date: toISTDateString(date),
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

      // Batch query all daily tasks in the range
      const dailyTasks = await DailyTask.find({
        userId,
        date: { $gte: rangeStart, $lte: rangeEnd },
      });

      // Fetch all questions for these daily tasks
      const dailyTaskIds = dailyTasks.map((i) => i._id);
      const questions = await Question.find({ dailyTask: { $in: dailyTaskIds } });

      const questionsByDailyTask = new Map<string, typeof questions>();
      for (const q of questions) {
        const key = q.dailyTask!.toString();
        if (!questionsByDailyTask.has(key)) questionsByDailyTask.set(key, []);
        questionsByDailyTask.get(key)!.push(q);
      }

      // Group daily tasks by date
      const dayMap = new Map<string, any[]>();
      for (const dailyTask of dailyTasks) {
        const dateStr = toISTDateString(dailyTask.date);
        if (!dayMap.has(dateStr)) dayMap.set(dateStr, []);
        dayMap.get(dateStr)!.push({
          ...dailyTask.toObject(),
          questions: questionsByDailyTask.get(dailyTask._id.toString()) || [],
        });
      }

      // Build response for each day
      const days: Array<{ date: string; summary: any; groups: any }> = [];
      const current = toISTMidnight(from);
      const endMs = toISTMidnight(to).getTime();

      while (current.getTime() <= endMs) {
        const dateStr = toISTDateString(current);
        const dayDailyTasks = dayMap.get(dateStr) || [];

        days.push({ date: dateStr, summary: computeSummary(dayDailyTasks), groups: dayDailyTasks });
        current.setDate(current.getDate() + 1);
      }

      res.status(200).json({
        from: toISTDateString(from),
        to: toISTDateString(to),
        days,
      });
      return;
    }

    res.status(400).json({ message: "Provide ?date= or ?from=&to= query parameters" });
  } catch (error) {
    res.status(500).json({ message: "Error fetching task history" });
  }
};

// ---- Daily task detail ----

export const getDailyTaskById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const dailyTask = await DailyTask.findOne({ _id: req.params.id, userId });

    if (!dailyTask) {
      res.status(404).json({ message: "Daily task not found" });
      return;
    }

    const questions = await Question.find({ dailyTask: dailyTask._id });

    res.status(200).json({
      ...dailyTask.toObject(),
      questions,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching daily task" });
  }
};
