import { Response } from "express";
import { Entry, TaskCompletion } from "../models";
import { AuthRequest, EntryStatus } from "../types";
import { isTaskOnDate, getDayRange } from "../utils/recurrence";

export const createEntry = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const {
      title,
      notes,
      solution,
      status,
      category,
      topic,
      difficulty,
      source,
      url,
      tags,
      deadline,
      isRecurring,
      recurrence,
      recurringEndDate,
    } = req.body;

    const entry = await Entry.create({
      title,
      notes,
      solution,
      status,
      category,
      topic,
      difficulty,
      source,
      url,
      tags,
      userId,
      deadline,
      isRecurring,
      recurrence,
      recurringEndDate,
    });

    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ message: "Error creating entry", error });
  }
};

export const getAllEntries = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const filter: Record<string, any> = { userId };
    if (req.query.category) filter.category = req.query.category as string;
    if (req.query.topic) filter.topic = req.query.topic as string;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty as string;
    if (req.query.status) filter.status = req.query.status as string;
    if (req.query.source) filter.source = req.query.source as string;
    if (req.query.tag) filter.tags = req.query.tag as string;

    // Support date filtering on the flat list
    if (req.query.date) {
      const { start, end } = getDayRange(new Date(req.query.date as string));
      filter.deadline = { $gte: start, $lte: end };
      filter.isRecurring = { $ne: true };
    } else if (req.query.from || req.query.to) {
      filter.deadline = {};
      if (req.query.from) filter.deadline.$gte = new Date(req.query.from as string);
      if (req.query.to) filter.deadline.$lte = new Date(req.query.to as string);
      filter.isRecurring = { $ne: true };
    }

    // Pagination
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      Entry.find(filter).sort({ deadline: 1 }).skip(skip).limit(limit),
      Entry.countDocuments(filter),
    ]);

    res.status(200).json({
      entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching entries", error });
  }
};

export const getEntryById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const entry = await Entry.findOne({ _id: req.params.id, userId });

    if (!entry) {
      res.status(404).json({ message: "Entry not found" });
      return;
    }

    res.status(200).json(entry);
  } catch (error) {
    res.status(500).json({ message: "Error fetching entry", error });
  }
};

export const updateEntry = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const {
      title,
      notes,
      solution,
      status,
      category,
      topic,
      difficulty,
      source,
      url,
      tags,
      deadline,
      isRecurring,
      recurrence,
      recurringEndDate,
    } = req.body;

    const entry = await Entry.findOneAndUpdate(
      { _id: req.params.id, userId },
      {
        title,
        notes,
        solution,
        status,
        category,
        topic,
        difficulty,
        source,
        url,
        tags,
        deadline,
        isRecurring,
        recurrence,
        recurringEndDate,
      },
      { new: true, runValidators: true }
    );

    if (!entry) {
      res.status(404).json({ message: "Entry not found" });
      return;
    }

    res.status(200).json(entry);
  } catch (error) {
    res.status(500).json({ message: "Error updating entry", error });
  }
};

export const deleteEntry = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const entry = await Entry.findOneAndDelete({ _id: req.params.id, userId });

    if (!entry) {
      res.status(404).json({ message: "Entry not found" });
      return;
    }

    // Clean up associated task completions
    await TaskCompletion.deleteMany({ entry: entry._id, userId });

    res.status(200).json({ message: "Entry deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting entry", error });
  }
};

// ---- Scheduling endpoints ----

/**
 * Resolves all tasks (one-off + recurring) for a given date,
 * merges with completions, and groups by category.
 */
const getTasksForDate = async (userId: string, date: Date) => {
  const { start, end } = getDayRange(date);

  // 1. One-off tasks whose deadline falls on this date
  const oneOffTasks = await Entry.find({
    userId,
    isRecurring: { $ne: true },
    deadline: { $gte: start, $lte: end },
  });

  // 2. All recurring tasks that could be active on this date
  const recurringTasks = await Entry.find({
    userId,
    isRecurring: true,
    deadline: { $lte: end },
    $or: [
      { recurringEndDate: { $exists: false } },
      { recurringEndDate: null },
      { recurringEndDate: { $gte: start } },
    ],
  });

  // Filter recurring tasks that actually fall on this date
  const activeRecurring = recurringTasks.filter((task) => isTaskOnDate(task, date));

  // 3. Merge all tasks for the day
  const allTasks = [...oneOffTasks, ...activeRecurring];

  // 4. Get completions for these tasks on this date
  const taskIds = allTasks.map((t) => t._id);
  const completions = await TaskCompletion.find({
    entry: { $in: taskIds },
    userId,
    date: { $gte: start, $lte: end },
  });

  const completionMap = new Map(
    completions.map((c) => [c.entry.toString(), c])
  );

  // 5. Build task objects with resolved status
  const resolvedTasks = allTasks.map((task) => {
    const completion = completionMap.get(task._id.toString());
    return {
      ...task.toObject(),
      status: completion ? completion.status : task.status,
      completionId: completion?._id || null,
      completionNotes: completion?.notes || null,
    };
  });

  // 6. Group by category
  const groupMap = new Map<
    string,
    { category: string; tasks: typeof resolvedTasks }
  >();

  for (const task of resolvedTasks) {
    const cat = task.category || "unknown";
    if (!groupMap.has(cat)) {
      groupMap.set(cat, { category: cat, tasks: [] });
    }
    groupMap.get(cat)!.tasks.push(task);
  }

  // 7. Build response with summaries
  const groups = Array.from(groupMap.values()).map((group) => {
    const summary = {
      total: group.tasks.length,
      completed: group.tasks.filter((t) => t.status === EntryStatus.Completed).length,
      in_progress: group.tasks.filter((t) => t.status === EntryStatus.InProgress).length,
      pending: group.tasks.filter((t) => t.status === EntryStatus.Pending).length,
    };
    return { category: group.category, summary, tasks: group.tasks };
  });

  const overallSummary = {
    total: resolvedTasks.length,
    completed: resolvedTasks.filter((t) => t.status === EntryStatus.Completed).length,
    in_progress: resolvedTasks.filter((t) => t.status === EntryStatus.InProgress).length,
    pending: resolvedTasks.filter((t) => t.status === EntryStatus.Pending).length,
  };

  return { summary: overallSummary, groups };
};

export const getToday = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const today = new Date();
    const result = await getTasksForDate(userId, today);

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
      const result = await getTasksForDate(userId, date);
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

      const days: Array<{
        date: string;
        summary: any;
        groups: any;
      }> = [];

      const current = new Date(from);
      current.setHours(0, 0, 0, 0);
      const endDate = new Date(to);
      endDate.setHours(0, 0, 0, 0);

      while (current <= endDate) {
        const result = await getTasksForDate(userId, new Date(current));
        days.push({
          date: current.toISOString().split("T")[0],
          ...result,
        });
        current.setDate(current.getDate() + 1);
      }

      res.status(200).json({ from: from.toISOString().split("T")[0], to: to.toISOString().split("T")[0], days });
      return;
    }

    res.status(400).json({ message: "Provide ?date= or ?from=&to= query parameters" });
  } catch (error) {
    res.status(500).json({ message: "Error fetching task history", error });
  }
};

// ---- Search ----

export const searchEntries = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const q = req.query.q as string;

    if (!q || q.trim().length === 0) {
      res.status(400).json({ message: "Search query 'q' is required" });
      return;
    }

    const regex = new RegExp(q.trim(), "i");

    const entries = await Entry.find({
      userId,
      $or: [
        { title: regex },
        { notes: regex },
        { solution: regex },
        { topic: regex },
        { source: regex },
        { tags: regex },
      ],
    }).sort({ updatedAt: -1 });

    res.status(200).json(entries);
  } catch (error) {
    res.status(500).json({ message: "Error searching entries", error });
  }
};

// ---- Tags ----

export const getAllTags = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const result = await Entry.aggregate([
      { $match: { userId } },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const tags = result.map((r) => ({ tag: r._id, count: r.count }));

    res.status(200).json(tags);
  } catch (error) {
    res.status(500).json({ message: "Error fetching tags", error });
  }
};

// ---- Topics ----

export const getAllTopics = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const filter: Record<string, any> = { userId, topic: { $nin: [null, ""] } };
    if (req.query.category) filter.category = req.query.category as string;

    const result = await Entry.aggregate([
      { $match: filter },
      { $group: { _id: "$topic", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const topics = result.map((r) => ({ topic: r._id, count: r.count }));

    res.status(200).json(topics);
  } catch (error) {
    res.status(500).json({ message: "Error fetching topics", error });
  }
};

// ---- Sources ----

export const getAllSources = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const result = await Entry.aggregate([
      { $match: { userId, source: { $nin: [null, ""] } } },
      { $group: { _id: "$source", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const sources = result.map((r) => ({ source: r._id, count: r.count }));

    res.status(200).json(sources);
  } catch (error) {
    res.status(500).json({ message: "Error fetching sources", error });
  }
};

// ---- Bulk Operations ----

export const bulkDeleteEntries = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ message: "ids must be a non-empty array" });
      return;
    }

    // Delete entries and their associated completions
    const [deleteResult] = await Promise.all([
      Entry.deleteMany({ _id: { $in: ids }, userId }),
      TaskCompletion.deleteMany({ entry: { $in: ids }, userId }),
    ]);

    res.status(200).json({
      message: `Deleted ${deleteResult.deletedCount} entries`,
      deletedCount: deleteResult.deletedCount,
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting entries", error });
  }
};

// ---- Task Completion ----

export const updateTaskStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { entry, date, status, notes } = req.body;

    if (!entry || !date || !status) {
      res.status(400).json({ message: "entry, date, and status are required" });
      return;
    }

    // Verify the entry belongs to this user
    const existingEntry = await Entry.findOne({ _id: entry, userId });
    if (!existingEntry) {
      res.status(404).json({ message: "Entry not found" });
      return;
    }

    const { start, end } = getDayRange(new Date(date));

    const completion = await TaskCompletion.findOneAndUpdate(
      {
        entry,
        userId,
        date: { $gte: start, $lte: end },
      },
      {
        entry,
        userId,
        date: new Date(date),
        status,
        notes,
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.status(200).json(completion);
  } catch (error) {
    res.status(500).json({ message: "Error updating task status", error });
  }
};
