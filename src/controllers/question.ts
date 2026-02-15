import { Response } from "express";
import { Question } from "../models/Question";
import { TaskInstance } from "../models/TaskInstance";
import { AuthRequest } from "../types/auth";
import { QuestionStatus } from "../types/question";
import { TaskInstanceStatus } from "../types/taskInstance";

// ---- Helper to recompute TaskInstance status ----

const recomputeInstanceStatus = async (instanceId: string) => {
  const instance = await TaskInstance.findById(instanceId);
  if (!instance) return;

  let status: TaskInstanceStatus;

  if (instance.addedQuestionCount === 0) {
    status = TaskInstanceStatus.Pending;
  } else if (instance.addedQuestionCount < instance.targetQuestionCount) {
    if (instance.solvedQuestionCount > 0 && instance.solvedQuestionCount < instance.addedQuestionCount) {
      status = TaskInstanceStatus.Incomplete; // has questions but below target, some solved
    } else {
      status = TaskInstanceStatus.Incomplete;
    }
  } else if (
    instance.solvedQuestionCount >= instance.addedQuestionCount &&
    instance.addedQuestionCount >= instance.targetQuestionCount
  ) {
    status = TaskInstanceStatus.Completed;
  } else if (instance.solvedQuestionCount > 0) {
    status = TaskInstanceStatus.InProgress;
  } else {
    // Has enough questions but none solved
    status = TaskInstanceStatus.Pending;
  }

  if (instance.status !== status) {
    instance.status = status;
    await instance.save();
  }
};

// ---- CRUD ----

export const createQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const {
      taskInstanceId,
      title,
      notes,
      solution,
      difficulty,
      topic,
      source,
      url,
      tags,
    } = req.body;

    // Verify the instance belongs to this user
    const instance = await TaskInstance.findOne({ _id: taskInstanceId, userId });
    if (!instance) {
      res.status(404).json({ message: "Task instance not found" });
      return;
    }

    const question = await Question.create({
      taskInstance: instance._id,
      task: instance.task,
      userId,
      title,
      notes,
      solution,
      difficulty,
      topic,
      source,
      url,
      tags,
    });

    // Update instance counter
    instance.addedQuestionCount += 1;
    await instance.save();
    await recomputeInstanceStatus(instance._id.toString());

    res.status(201).json(question);
  } catch (error) {
    res.status(500).json({ message: "Error creating question", error });
  }
};

export const getAllQuestions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const filter: Record<string, any> = { userId };

    // Backlog filter: ?backlog=true for backlog only, ?backlog=all for everything, default excludes backlog
    const backlog = req.query.backlog as string;
    if (backlog === "true") {
      filter.taskInstance = null;
    } else if (backlog !== "all") {
      filter.taskInstance = { $ne: null };
    }

    if (req.query.task) filter.task = req.query.task as string;
    if (req.query.taskInstance) filter.taskInstance = req.query.taskInstance as string;
    if (req.query.status) filter.status = req.query.status as string;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty as string;
    if (req.query.topic) filter.topic = req.query.topic as string;
    if (req.query.source) filter.source = req.query.source as string;
    if (req.query.tag) filter.tags = req.query.tag as string;

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [questions, total] = await Promise.all([
      Question.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Question.countDocuments(filter),
    ]);

    res.status(200).json({
      questions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching questions", error });
  }
};

export const getQuestionById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const question = await Question.findOne({ _id: req.params.id, userId });

    if (!question) {
      res.status(404).json({ message: "Question not found" });
      return;
    }

    res.status(200).json(question);
  } catch (error) {
    res.status(500).json({ message: "Error fetching question", error });
  }
};

export const updateQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { title, notes, solution, difficulty, topic, source, url, tags } = req.body;

    const question = await Question.findOneAndUpdate(
      { _id: req.params.id, userId },
      { title, notes, solution, difficulty, topic, source, url, tags },
      { new: true, runValidators: true }
    );

    if (!question) {
      res.status(404).json({ message: "Question not found" });
      return;
    }

    res.status(200).json(question);
  } catch (error) {
    res.status(500).json({ message: "Error updating question", error });
  }
};

export const deleteQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const question = await Question.findOneAndDelete({ _id: req.params.id, userId });

    if (!question) {
      res.status(404).json({ message: "Question not found" });
      return;
    }

    // Update instance counters (only if question was assigned to an instance)
    if (question.taskInstance) {
      const update: Record<string, number> = { addedQuestionCount: -1 };
      if (question.status === QuestionStatus.Solved) {
        update.solvedQuestionCount = -1;
      }
      await TaskInstance.findByIdAndUpdate(question.taskInstance, { $inc: update });
      await recomputeInstanceStatus(question.taskInstance.toString());
    }

    res.status(200).json({ message: "Question deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting question", error });
  }
};

// ---- Solve ----

export const solveQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const question = await Question.findOne({ _id: req.params.id, userId });

    if (!question) {
      res.status(404).json({ message: "Question not found" });
      return;
    }

    if (!question.taskInstance) {
      res.status(400).json({ message: "Cannot solve a backlog question. Move it to a task instance first." });
      return;
    }

    if (question.status === QuestionStatus.Solved) {
      res.status(400).json({ message: "Question is already solved" });
      return;
    }

    question.status = QuestionStatus.Solved;
    question.solvedAt = new Date();
    await question.save();

    // Update instance counter
    await TaskInstance.findByIdAndUpdate(question.taskInstance, {
      $inc: { solvedQuestionCount: 1 },
    });
    await recomputeInstanceStatus(question.taskInstance.toString());

    res.status(200).json(question);
  } catch (error) {
    res.status(500).json({ message: "Error solving question", error });
  }
};

// ---- Search ----

export const searchQuestions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const q = req.query.q as string;

    if (!q || q.trim().length === 0) {
      res.status(400).json({ message: "Search query 'q' is required" });
      return;
    }

    const regex = new RegExp(q.trim(), "i");

    const filter: Record<string, any> = {
      userId,
      $or: [
        { title: regex },
        { notes: regex },
        { solution: regex },
        { topic: regex },
        { source: regex },
        { tags: regex },
      ],
    };

    // Additional filters
    if (req.query.status) filter.status = req.query.status as string;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty as string;

    const questions = await Question.find(filter).sort({ updatedAt: -1 });

    res.status(200).json(questions);
  } catch (error) {
    res.status(500).json({ message: "Error searching questions", error });
  }
};

// ---- Aggregations ----

export const getAllTags = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const result = await Question.aggregate([
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

export const getAllTopics = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const filter: Record<string, any> = { userId, topic: { $nin: [null, ""] } };
    if (req.query.category) {
      // Need to join with TaskInstance to filter by category
      const instances = await TaskInstance.find({
        userId,
        category: req.query.category as string,
      }).select("_id");
      filter.taskInstance = { $in: instances.map((i) => i._id) };
    }

    const result = await Question.aggregate([
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

export const getAllSources = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const result = await Question.aggregate([
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

export const bulkDeleteQuestions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ message: "ids must be a non-empty array" });
      return;
    }

    // Get questions before deleting to update instance counters
    const questions = await Question.find({ _id: { $in: ids }, userId });

    // Group by instance and count (skip backlog questions with no instance)
    const instanceUpdates = new Map<string, { added: number; solved: number }>();
    for (const q of questions) {
      if (!q.taskInstance) continue;
      const key = q.taskInstance.toString();
      if (!instanceUpdates.has(key)) instanceUpdates.set(key, { added: 0, solved: 0 });
      const update = instanceUpdates.get(key)!;
      update.added += 1;
      if (q.status === QuestionStatus.Solved) update.solved += 1;
    }

    // Delete questions
    const deleteResult = await Question.deleteMany({ _id: { $in: ids }, userId });

    // Update instance counters
    for (const [instanceId, counts] of instanceUpdates) {
      await TaskInstance.findByIdAndUpdate(instanceId, {
        $inc: {
          addedQuestionCount: -counts.added,
          solvedQuestionCount: -counts.solved,
        },
      });
      await recomputeInstanceStatus(instanceId);
    }

    res.status(200).json({
      message: `Deleted ${deleteResult.deletedCount} questions`,
      deletedCount: deleteResult.deletedCount,
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting questions", error });
  }
};

// ---- Backlog ----

export const createBacklogQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { title, notes, solution, difficulty, topic, source, url, tags } = req.body;

    const question = await Question.create({
      taskInstance: null,
      task: null,
      userId,
      title,
      notes,
      solution,
      difficulty,
      topic,
      source,
      url,
      tags,
    });

    res.status(201).json(question);
  } catch (error) {
    res.status(500).json({ message: "Error creating backlog question", error });
  }
};

export const getBacklogQuestions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const filter: Record<string, any> = { userId, taskInstance: null };

    if (req.query.status) filter.status = req.query.status as string;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty as string;
    if (req.query.topic) filter.topic = req.query.topic as string;
    if (req.query.source) filter.source = req.query.source as string;
    if (req.query.tag) filter.tags = req.query.tag as string;

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [questions, total] = await Promise.all([
      Question.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Question.countDocuments(filter),
    ]);

    res.status(200).json({
      questions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching backlog questions", error });
  }
};

export const moveToTaskInstance = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { taskInstanceId } = req.body;

    const question = await Question.findOne({ _id: req.params.id, userId });
    if (!question) {
      res.status(404).json({ message: "Question not found" });
      return;
    }

    if (question.taskInstance) {
      res.status(400).json({ message: "Question is already assigned to a task instance" });
      return;
    }

    const instance = await TaskInstance.findOne({ _id: taskInstanceId, userId });
    if (!instance) {
      res.status(404).json({ message: "Task instance not found" });
      return;
    }

    question.taskInstance = instance._id;
    question.task = instance.task;
    await question.save();

    instance.addedQuestionCount += 1;
    await instance.save();
    await recomputeInstanceStatus(instance._id.toString());

    res.status(200).json(question);
  } catch (error) {
    res.status(500).json({ message: "Error moving question to task instance", error });
  }
};

export const bulkMoveToTaskInstance = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { questionIds, taskInstanceId } = req.body;

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      res.status(400).json({ message: "questionIds must be a non-empty array" });
      return;
    }

    const instance = await TaskInstance.findOne({ _id: taskInstanceId, userId });
    if (!instance) {
      res.status(404).json({ message: "Task instance not found" });
      return;
    }

    // Only move questions that are actually backlog (taskInstance === null)
    const backlogQuestions = await Question.find({
      _id: { $in: questionIds },
      userId,
      taskInstance: null,
    });

    if (backlogQuestions.length > 0) {
      await Question.updateMany(
        { _id: { $in: backlogQuestions.map((q) => q._id) } },
        { taskInstance: instance._id, task: instance.task }
      );

      instance.addedQuestionCount += backlogQuestions.length;
      await instance.save();
      await recomputeInstanceStatus(instance._id.toString());
    }

    res.status(200).json({
      movedCount: backlogQuestions.length,
      skippedCount: questionIds.length - backlogQuestions.length,
    });
  } catch (error) {
    res.status(500).json({ message: "Error moving questions to task instance", error });
  }
};
