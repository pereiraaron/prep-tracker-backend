import { Response } from "express";
import { Task } from "../models/Task";
import { DailyTask } from "../models/DailyTask";
import { Question } from "../models/Question";
import { AuthRequest } from "../types/auth";
import { TaskStatus } from "../types/task";
import { DailyTaskStatus } from "../types/dailyTask";
import { isTaskOnDate, getDayRange, toISTDateString, toISTMidnight } from "../utils/recurrence";
import { sendSuccess, sendPaginated, sendError } from "../utils/response";
import { logger } from "../utils/logger";

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

    sendSuccess(res, task, 201);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error creating task");
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

    sendPaginated(res, tasks, { page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching tasks");
  }
};

export const getTaskById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const task = await Task.findOne({ _id: req.params.id, userId });

    if (!task) {
      sendError(res, "Task not found", 404);
      return;
    }

    sendSuccess(res, task);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching task");
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
      sendError(res, "Task not found", 404);
      return;
    }

    sendSuccess(res, task);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error updating task");
  }
};

export const deleteTask = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const task = await Task.findOneAndDelete({ _id: req.params.id, userId });

    if (!task) {
      sendError(res, "Task not found", 404);
      return;
    }

    // Clean up daily tasks (hard delete) and soft-delete questions
    await Promise.all([
      DailyTask.deleteMany({ task: task._id, userId }),
      Question.updateMany({ task: task._id, userId }, { deletedAt: new Date() }),
    ]);

    sendSuccess(res, { message: "Task deleted" });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error deleting task");
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
      ...dailyTask.toJSON(),
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
      sendError(res, "Unauthorized", 401);
      return;
    }

    const today = new Date();
    const result = await materializeDailyTasksForDate(userId, today);

    sendSuccess(res, { date: toISTDateString(today), ...result });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching today's tasks");
  }
};

export const getHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, "Unauthorized", 401);
      return;
    }

    // Single date query
    if (req.query.date) {
      const date = new Date(req.query.date as string);
      const result = await materializeDailyTasksForDate(userId, date);
      sendSuccess(res, { date: toISTDateString(date), ...result });
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
          ...dailyTask.toJSON(),
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

      sendSuccess(res, { from: toISTDateString(from), to: toISTDateString(to), days });
      return;
    }

    sendError(res, "Provide ?date= or ?from=&to= query parameters", 400);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching task history");
  }
};

// ---- Daily task detail ----

export const getDailyTaskById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const dailyTask = await DailyTask.findOne({ _id: req.params.id, userId });

    if (!dailyTask) {
      sendError(res, "Daily task not found", 404);
      return;
    }

    const questions = await Question.find({ dailyTask: dailyTask._id });

    sendSuccess(res, { ...dailyTask.toJSON(), questions });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching daily task");
  }
};
