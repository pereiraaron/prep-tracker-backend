import { Response } from "express";
import { Entry, TaskCompletion, Type } from "../models";
import { AuthRequest, EntryStatus } from "../types";
import { isTaskOnDate, getDayRange } from "../utils/recurrence";
import { validateMetadata } from "../utils/validateMetadata";

export const createEntry = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const {
      title,
      notes,
      status,
      type,
      subtype,
      tags,
      deadline,
      isRecurring,
      recurrence,
      recurringEndDate,
      metadata,
    } = req.body;

    // Validate metadata against type's field definitions
    if (metadata && type) {
      const typeDoc = await Type.findById(type);
      if (typeDoc && typeDoc.fields.length > 0) {
        const { valid, errors } = validateMetadata(metadata, typeDoc.fields);
        if (!valid) {
          res.status(400).json({ message: "Metadata validation failed", errors });
          return;
        }
      }
    }

    const entry = await Entry.create({
      title,
      notes,
      status,
      type,
      subtype,
      tags,
      userId,
      deadline,
      isRecurring,
      recurrence,
      recurringEndDate,
      metadata,
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
    if (req.query.type) filter.type = req.query.type as string;
    if (req.query.subtype) filter.subtype = req.query.subtype as string;
    if (req.query.status) filter.status = req.query.status as string;

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

    const entries = await Entry.find(filter)
      .populate("type", "name")
      .populate("subtype", "name")
      .sort({ deadline: 1 });

    res.status(200).json(entries);
  } catch (error) {
    res.status(500).json({ message: "Error fetching entries", error });
  }
};

export const getEntryById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const entry = await Entry.findOne({ _id: req.params.id, userId })
      .populate("type", "name")
      .populate("subtype", "name");

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
      status,
      type,
      subtype,
      tags,
      deadline,
      isRecurring,
      recurrence,
      recurringEndDate,
      metadata,
    } = req.body;

    // Validate metadata if provided
    const typeId = type || (await Entry.findOne({ _id: req.params.id, userId }))?.type;
    if (metadata && typeId) {
      const typeDoc = await Type.findById(typeId);
      if (typeDoc && typeDoc.fields.length > 0) {
        const { valid, errors } = validateMetadata(metadata, typeDoc.fields);
        if (!valid) {
          res.status(400).json({ message: "Metadata validation failed", errors });
          return;
        }
      }
    }

    const entry = await Entry.findOneAndUpdate(
      { _id: req.params.id, userId },
      {
        title,
        notes,
        status,
        type,
        subtype,
        tags,
        deadline,
        isRecurring,
        recurrence,
        recurringEndDate,
        metadata,
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

    res.status(200).json({ message: "Entry deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting entry", error });
  }
};

// ---- Scheduling endpoints ----

/**
 * Resolves all tasks (one-off + recurring) for a given date,
 * merges with completions, and groups by type.
 */
const getTasksForDate = async (userId: string, date: Date) => {
  const { start, end } = getDayRange(date);

  // 1. One-off tasks whose deadline falls on this date
  const oneOffTasks = await Entry.find({
    userId,
    isRecurring: { $ne: true },
    deadline: { $gte: start, $lte: end },
  })
    .populate("type", "name")
    .populate("subtype", "name");

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
  })
    .populate("type", "name")
    .populate("subtype", "name");

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
      completionMetadata: completion?.metadata || null,
    };
  });

  // 6. Group by type
  const groupMap = new Map<
    string,
    { type: any; tasks: typeof resolvedTasks }
  >();

  for (const task of resolvedTasks) {
    const typeId = task.type?._id?.toString() || "unknown";
    if (!groupMap.has(typeId)) {
      groupMap.set(typeId, { type: task.type, tasks: [] });
    }
    groupMap.get(typeId)!.tasks.push(task);
  }

  // 7. Build response with summaries
  const groups = Array.from(groupMap.values()).map((group) => {
    const summary = {
      total: group.tasks.length,
      completed: group.tasks.filter((t) => t.status === EntryStatus.Completed).length,
      in_progress: group.tasks.filter((t) => t.status === EntryStatus.InProgress).length,
      pending: group.tasks.filter((t) => t.status === EntryStatus.Pending).length,
    };
    return { type: group.type, summary, tasks: group.tasks };
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

// ---- Task Completion ----

export const updateTaskStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { entry, date, status, notes, metadata } = req.body;

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

    // Validate metadata against the entry's type field definitions
    if (metadata) {
      const typeDoc = await Type.findById(existingEntry.type);
      if (typeDoc && typeDoc.fields.length > 0) {
        const { valid, errors } = validateMetadata(metadata, typeDoc.fields);
        if (!valid) {
          res.status(400).json({ message: "Metadata validation failed", errors });
          return;
        }
      }
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
        metadata,
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.status(200).json(completion);
  } catch (error) {
    res.status(500).json({ message: "Error updating task status", error });
  }
};
