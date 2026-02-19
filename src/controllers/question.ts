import { Response } from "express";
import mongoose from "mongoose";
import { Question } from "../models/Question";
import { DailyTask } from "../models/DailyTask";
import { AuthRequest } from "../types/auth";
import { QuestionStatus, REVIEW_INTERVALS } from "../types/question";
import { DailyTaskStatus } from "../types/dailyTask";
import { sendSuccess, sendPaginated, sendError } from "../utils/response";
import { logger } from "../utils/logger";

// ---- Helper to recompute DailyTask status ----

const recomputeDailyTaskStatus = async (dailyTaskId: string) => {
  const dailyTask = await DailyTask.findById(dailyTaskId);
  if (!dailyTask) return;

  let status: DailyTaskStatus;

  if (dailyTask.addedQuestionCount === 0) {
    status = DailyTaskStatus.Pending;
  } else if (dailyTask.addedQuestionCount < dailyTask.targetQuestionCount) {
    status = DailyTaskStatus.Incomplete;
  } else if (
    dailyTask.solvedQuestionCount >= dailyTask.addedQuestionCount &&
    dailyTask.addedQuestionCount >= dailyTask.targetQuestionCount
  ) {
    status = DailyTaskStatus.Completed;
  } else if (dailyTask.solvedQuestionCount > 0) {
    status = DailyTaskStatus.InProgress;
  } else {
    // Has enough questions but none solved
    status = DailyTaskStatus.Pending;
  }

  if (dailyTask.status !== status) {
    dailyTask.status = status;
    await dailyTask.save();
  }
};

// ---- CRUD ----

export const createQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const {
      dailyTaskId,
      title,
      notes,
      solution,
      difficulty,
      topic,
      source,
      url,
      tags,
    } = req.body;

    // Verify the daily task belongs to this user
    const dailyTask = await DailyTask.findOne({ _id: dailyTaskId, userId });
    if (!dailyTask) {
      sendError(res, "Daily task not found", 404);
      return;
    }

    const question = await Question.create({
      dailyTask: dailyTask._id,
      task: dailyTask.task,
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

    // Update daily task counter atomically
    await DailyTask.findByIdAndUpdate(dailyTask._id, {
      $inc: { addedQuestionCount: 1 },
    });
    await recomputeDailyTaskStatus(dailyTask._id.toString());

    sendSuccess(res, question, 201);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error creating question");
  }
};

export const getAllQuestions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const filter: Record<string, any> = { userId };

    // Backlog filter: ?backlog=true for backlog only, ?backlog=all for everything, default excludes backlog
    const backlog = req.query.backlog as string;
    if (backlog === "true") {
      filter.dailyTask = null;
    } else if (backlog !== "all") {
      filter.dailyTask = { $ne: null };
    }

    if (req.query.task) filter.task = req.query.task as string;
    if (req.query.dailyTask) filter.dailyTask = req.query.dailyTask as string;
    if (req.query.status) filter.status = req.query.status as string;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty as string;
    if (req.query.topic) filter.topic = req.query.topic as string;
    if (req.query.source) filter.source = req.query.source as string;
    if (req.query.tag) filter.tags = req.query.tag as string;
    if (req.query.starred === "true") filter.starred = true;

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [questions, total] = await Promise.all([
      Question.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Question.countDocuments(filter),
    ]);

    sendPaginated(res, questions, { page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching questions");
  }
};

export const getQuestionById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const question = await Question.findOne({ _id: req.params.id, userId });

    if (!question) {
      sendError(res, "Question not found", 404);
      return;
    }

    sendSuccess(res, question);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching question");
  }
};

export const updateQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { title, notes, solution, difficulty, topic, source, url, tags } = req.body;

    const question = await Question.findOne({ _id: req.params.id, userId });
    if (!question) {
      sendError(res, "Question not found", 404);
      return;
    }

    // Snapshot old notes/solution if they changed
    const notesChanged = notes !== undefined && notes !== question.notes;
    const solutionChanged = solution !== undefined && solution !== question.solution;

    if ((notesChanged || solutionChanged) && (question.notes || question.solution)) {
      question.revisions.push({
        notes: question.notes,
        solution: question.solution,
        editedAt: new Date(),
      });
    }

    if (title !== undefined) question.title = title;
    if (notes !== undefined) question.notes = notes;
    if (solution !== undefined) question.solution = solution;
    if (difficulty !== undefined) question.difficulty = difficulty;
    if (topic !== undefined) question.topic = topic;
    if (source !== undefined) question.source = source;
    if (url !== undefined) question.url = url;
    if (tags !== undefined) question.tags = tags;

    await question.save();

    sendSuccess(res, question);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error updating question");
  }
};

export const deleteQuestion = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const userId = req.user?.id;
    const question = await Question.findOne({ _id: req.params.id, userId }).session(session);

    if (!question) {
      await session.abortTransaction();
      sendError(res, "Question not found", 404);
      return;
    }

    // Soft delete
    question.deletedAt = new Date();
    await question.save({ session });

    // Update daily task counters (only if question was assigned to a daily task)
    if (question.dailyTask) {
      const update: Record<string, number> = { addedQuestionCount: -1 };
      if (question.status === QuestionStatus.Solved) {
        update.solvedQuestionCount = -1;
      }
      await DailyTask.findByIdAndUpdate(question.dailyTask, { $inc: update }, { session });
    }

    await session.commitTransaction();

    if (question.dailyTask) {
      await recomputeDailyTaskStatus(question.dailyTask.toString());
    }

    sendSuccess(res, { message: "Question deleted" });
  } catch (error) {
    await session.abortTransaction();
    logger.error((error as Error).message);
    sendError(res, "Error deleting question");
  } finally {
    session.endSession();
  }
};

// ---- Solve ----

export const solveQuestion = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const userId = req.user?.id;
    const question = await Question.findOne({ _id: req.params.id, userId }).session(session);

    if (!question) {
      await session.abortTransaction();
      sendError(res, "Question not found", 404);
      return;
    }

    if (!question.dailyTask) {
      await session.abortTransaction();
      sendError(res, "Cannot solve a backlog question. Move it to a daily task first.", 400);
      return;
    }

    if (question.status === QuestionStatus.Solved) {
      await session.abortTransaction();
      sendError(res, "Question is already solved", 400);
      return;
    }

    question.status = QuestionStatus.Solved;
    question.solvedAt = new Date();

    // Schedule first spaced repetition review (1 day from now)
    if (question.reviewCount === 0) {
      const nextReview = new Date();
      nextReview.setDate(nextReview.getDate() + REVIEW_INTERVALS[0]);
      question.nextReviewAt = nextReview;
    }

    await question.save({ session });

    // Update daily task counter
    await DailyTask.findByIdAndUpdate(question.dailyTask, {
      $inc: { solvedQuestionCount: 1 },
    }, { session });

    await session.commitTransaction();
    await recomputeDailyTaskStatus(question.dailyTask.toString());

    sendSuccess(res, question);
  } catch (error) {
    await session.abortTransaction();
    logger.error((error as Error).message);
    sendError(res, "Error solving question");
  } finally {
    session.endSession();
  }
};

// ---- Reset ----

export const resetQuestion = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const userId = req.user?.id;
    const question = await Question.findOne({ _id: req.params.id, userId }).session(session);

    if (!question) {
      await session.abortTransaction();
      sendError(res, "Question not found", 404);
      return;
    }

    if (question.status !== QuestionStatus.Solved) {
      await session.abortTransaction();
      sendError(res, "Question is not solved", 400);
      return;
    }

    question.status = QuestionStatus.Pending;
    question.solvedAt = undefined;
    question.reviewCount = 0;
    question.nextReviewAt = undefined;
    question.lastReviewedAt = undefined;
    await question.save({ session });

    // Update daily task counter
    if (question.dailyTask) {
      await DailyTask.findByIdAndUpdate(question.dailyTask, {
        $inc: { solvedQuestionCount: -1 },
      }, { session });
    }

    await session.commitTransaction();

    if (question.dailyTask) {
      await recomputeDailyTaskStatus(question.dailyTask.toString());
    }

    sendSuccess(res, question);
  } catch (error) {
    await session.abortTransaction();
    logger.error((error as Error).message);
    sendError(res, "Error resetting question");
  } finally {
    session.endSession();
  }
};

// ---- Star ----

export const toggleStarred = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const question = await Question.findOne({ _id: req.params.id, userId });

    if (!question) {
      sendError(res, "Question not found", 404);
      return;
    }

    question.starred = !question.starred;
    await question.save();

    sendSuccess(res, question);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error toggling starred");
  }
};

// ---- Spaced Repetition ----

export const reviewQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const question = await Question.findOne({ _id: req.params.id, userId });

    if (!question) {
      sendError(res, "Question not found", 404);
      return;
    }

    if (question.status !== QuestionStatus.Solved) {
      sendError(res, "Only solved questions can be reviewed", 400);
      return;
    }

    question.reviewCount += 1;
    question.lastReviewedAt = new Date();

    // Calculate next review interval
    const intervalIndex = Math.min(question.reviewCount, REVIEW_INTERVALS.length - 1);
    const daysUntilNext = REVIEW_INTERVALS[intervalIndex];
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + daysUntilNext);
    question.nextReviewAt = nextReview;

    await question.save();

    sendSuccess(res, question);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error reviewing question");
  }
};

export const getDueForReview = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const now = new Date();

    const filter: Record<string, any> = {
      userId,
      status: QuestionStatus.Solved,
      nextReviewAt: { $lte: now },
    };

    if (req.query.topic) filter.topic = req.query.topic as string;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty as string;

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [questions, total] = await Promise.all([
      Question.find(filter).sort({ nextReviewAt: 1 }).skip(skip).limit(limit),
      Question.countDocuments(filter),
    ]);

    sendPaginated(res, questions, { page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching due reviews");
  }
};

// ---- Revisions ----

export const getRevisions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const question = await Question.findOne({ _id: req.params.id, userId });

    if (!question) {
      sendError(res, "Question not found", 404);
      return;
    }

    sendSuccess(res, {
      current: { notes: question.notes, solution: question.solution },
      revisions: question.revisions,
    });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching revisions");
  }
};

// ---- Search ----

export const searchQuestions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const q = req.query.q as string;

    if (!q || q.trim().length === 0) {
      sendError(res, "Search query 'q' is required", 400);
      return;
    }

    if (q.trim().length > 200) {
      sendError(res, "Search query must be 200 characters or less", 400);
      return;
    }

    const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");

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

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [questions, total] = await Promise.all([
      Question.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
      Question.countDocuments(filter),
    ]);

    sendPaginated(res, questions, { page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error searching questions");
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
    sendSuccess(res, tags);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching tags");
  }
};

export const getAllTopics = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const filter: Record<string, any> = { userId, topic: { $nin: [null, ""] } };
    if (req.query.category) {
      // Need to join with DailyTask to filter by category
      const dailyTasks = await DailyTask.find({
        userId,
        category: req.query.category as string,
      }).select("_id");
      filter.dailyTask = { $in: dailyTasks.map((i) => i._id) };
    }

    const result = await Question.aggregate([
      { $match: filter },
      { $group: { _id: "$topic", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const topics = result.map((r) => ({ topic: r._id, count: r.count }));
    sendSuccess(res, topics);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching topics");
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
    sendSuccess(res, sources);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching sources");
  }
};

// ---- Bulk Operations ----

export const bulkDeleteQuestions = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const userId = req.user?.id;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      await session.abortTransaction();
      sendError(res, "ids must be a non-empty array", 400);
      return;
    }

    // Get questions before deleting to update daily task counters
    const questions = await Question.find({ _id: { $in: ids }, userId }).session(session);

    // Group by daily task and count (skip backlog questions with no daily task)
    const dailyTaskUpdates = new Map<string, { added: number; solved: number }>();
    for (const q of questions) {
      if (!q.dailyTask) continue;
      const key = q.dailyTask.toString();
      if (!dailyTaskUpdates.has(key)) dailyTaskUpdates.set(key, { added: 0, solved: 0 });
      const update = dailyTaskUpdates.get(key)!;
      update.added += 1;
      if (q.status === QuestionStatus.Solved) update.solved += 1;
    }

    // Soft delete questions
    const now = new Date();
    const softDeleteResult = await Question.updateMany(
      { _id: { $in: ids }, userId },
      { deletedAt: now },
      { session }
    );

    // Update daily task counters
    for (const [dailyTaskId, counts] of dailyTaskUpdates) {
      await DailyTask.findByIdAndUpdate(dailyTaskId, {
        $inc: {
          addedQuestionCount: -counts.added,
          solvedQuestionCount: -counts.solved,
        },
      }, { session });
    }

    await session.commitTransaction();

    // Recompute statuses outside the transaction
    for (const [dailyTaskId] of dailyTaskUpdates) {
      await recomputeDailyTaskStatus(dailyTaskId);
    }

    sendSuccess(res, {
      message: `Deleted ${softDeleteResult.modifiedCount} questions`,
      deletedCount: softDeleteResult.modifiedCount,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error((error as Error).message);
    sendError(res, "Error deleting questions");
  } finally {
    session.endSession();
  }
};

// ---- Deduplicate ----

export const deduplicateQuestions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    // Find duplicate titles (case-insensitive) for this user
    const duplicates = await Question.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: { $toLower: "$title" },
          count: { $sum: 1 },
          docs: {
            $push: {
              _id: "$_id",
              title: "$title",
              status: "$status",
              dailyTask: "$dailyTask",
              createdAt: "$createdAt",
            },
          },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
    ]);

    if (duplicates.length === 0) {
      sendSuccess(res, { message: "No duplicates found", deleted: 0, groups: [] });
      return;
    }

    const idsToDelete: string[] = [];
    const groups: Array<{ title: string; kept: string; deleted: string[] }> = [];

    for (const group of duplicates) {
      const docs = group.docs as Array<{
        _id: any;
        title: string;
        status: string;
        dailyTask: any;
        createdAt: Date;
      }>;

      // Keep the "best" one: prefer solved > in_progress > pending, then earliest created
      docs.sort((a, b) => {
        const statusOrder: Record<string, number> = {
          [QuestionStatus.Solved]: 0,
          [QuestionStatus.InProgress]: 1,
          [QuestionStatus.Pending]: 2,
        };
        const diff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
        if (diff !== 0) return diff;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      const keep = docs[0];
      const toDelete = docs.slice(1);

      idsToDelete.push(...toDelete.map((d) => d._id.toString()));
      groups.push({
        title: keep.title,
        kept: keep._id.toString(),
        deleted: toDelete.map((d) => d._id.toString()),
      });
    }

    // Get questions to delete for counter updates
    const questionsToDelete = await Question.find({
      _id: { $in: idsToDelete },
      userId,
    });

    // Group by daily task for counter updates
    const dailyTaskUpdates = new Map<string, { added: number; solved: number }>();
    for (const q of questionsToDelete) {
      if (!q.dailyTask) continue;
      const key = q.dailyTask.toString();
      if (!dailyTaskUpdates.has(key)) dailyTaskUpdates.set(key, { added: 0, solved: 0 });
      const update = dailyTaskUpdates.get(key)!;
      update.added += 1;
      if (q.status === QuestionStatus.Solved) update.solved += 1;
    }

    // Soft delete duplicates
    await Question.updateMany({ _id: { $in: idsToDelete }, userId }, { deletedAt: new Date() });

    // Update daily task counters
    for (const [dailyTaskId, counts] of dailyTaskUpdates) {
      await DailyTask.findByIdAndUpdate(dailyTaskId, {
        $inc: {
          addedQuestionCount: -counts.added,
          solvedQuestionCount: -counts.solved,
        },
      });
      await recomputeDailyTaskStatus(dailyTaskId);
    }

    sendSuccess(res, {
      message: `Deleted ${idsToDelete.length} duplicate questions`,
      deleted: idsToDelete.length,
      groups,
    });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error deduplicating questions");
  }
};

// ---- Backlog ----

export const createBacklogQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { title, notes, solution, difficulty, topic, source, url, tags } = req.body;

    const question = await Question.create({
      dailyTask: null,
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

    sendSuccess(res, question, 201);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error creating backlog question");
  }
};

export const getBacklogQuestions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const filter: Record<string, any> = { userId, dailyTask: null };

    if (req.query.status) filter.status = req.query.status as string;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty as string;
    if (req.query.topic) filter.topic = req.query.topic as string;
    if (req.query.source) filter.source = req.query.source as string;
    if (req.query.tag) filter.tags = req.query.tag as string;
    if (req.query.starred === "true") filter.starred = true;

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [questions, total] = await Promise.all([
      Question.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Question.countDocuments(filter),
    ]);

    sendPaginated(res, questions, { page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching backlog questions");
  }
};

export const moveToDailyTask = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { dailyTaskId } = req.body;

    const question = await Question.findOne({ _id: req.params.id, userId });
    if (!question) {
      sendError(res, "Question not found", 404);
      return;
    }

    if (question.dailyTask) {
      sendError(res, "Question is already assigned to a daily task", 400);
      return;
    }

    const dailyTask = await DailyTask.findOne({ _id: dailyTaskId, userId });
    if (!dailyTask) {
      sendError(res, "Daily task not found", 404);
      return;
    }

    question.dailyTask = dailyTask._id;
    question.task = dailyTask.task;
    await question.save();

    await DailyTask.findByIdAndUpdate(dailyTask._id, {
      $inc: { addedQuestionCount: 1 },
    });
    await recomputeDailyTaskStatus(dailyTask._id.toString());

    sendSuccess(res, question);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error moving question to daily task");
  }
};

export const bulkMoveToDailyTask = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { questionIds, dailyTaskId } = req.body;

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      sendError(res, "questionIds must be a non-empty array", 400);
      return;
    }

    const dailyTask = await DailyTask.findOne({ _id: dailyTaskId, userId });
    if (!dailyTask) {
      sendError(res, "Daily task not found", 404);
      return;
    }

    // Only move questions that are actually backlog (dailyTask === null)
    const backlogQuestions = await Question.find({
      _id: { $in: questionIds },
      userId,
      dailyTask: null,
    });

    if (backlogQuestions.length > 0) {
      await Question.updateMany(
        { _id: { $in: backlogQuestions.map((q) => q._id) } },
        { dailyTask: dailyTask._id, task: dailyTask.task }
      );

      await DailyTask.findByIdAndUpdate(dailyTask._id, {
        $inc: { addedQuestionCount: backlogQuestions.length },
      });
      await recomputeDailyTaskStatus(dailyTask._id.toString());
    }

    sendSuccess(res, {
      movedCount: backlogQuestions.length,
      skippedCount: questionIds.length - backlogQuestions.length,
    });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error moving questions to daily task");
  }
};
