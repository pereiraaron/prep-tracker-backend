import { Response } from "express";
import { Question } from "../models/Question";
import { AuthRequest } from "../types/auth";
import { QuestionStatus } from "../types/question";
import { sendSuccess, sendPaginated, sendError } from "../utils/response";
import { logger } from "../utils/logger";
import { cache } from "../utils/cache";

// Exclude heavy fields from list queries (solution/notes can be 50KB each)
const LIST_PROJECTION = { solution: 0, notes: 0, templates: 0 } as const;

// Granular cache invalidation groups
const ALL_STATS = [
  "overview", "categories", "difficulties", "topics", "sources", "companyTags",
  "tags", "progress", "weeklyProgress", "cumulativeProgress", "heatmap",
  "difficultyByCategory", "streaks", "insights", "batch",
] as const;
const BACKLOG_STATS = ["overview", "insights", "batch"] as const;
const METADATA_STATS = [
  "overview", "categories", "difficulties", "topics", "sources", "companyTags",
  "tags", "difficultyByCategory", "insights", "batch",
] as const;

const invalidateStats = (userId: string, keys: readonly string[]) => {
  for (const key of keys) cache.invalidate(`stats:${userId}:${key}`);
};

// ---- CRUD ----

export const createQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { title, notes, solution, difficulty, topics, source, url, tags, companyTags, category } = req.body;

    const doc = await Question.create({
      userId,
      category,
      title,
      notes,
      solution,
      difficulty,
      topics,
      source,
      url,
      tags,
      companyTags,
      status: QuestionStatus.Solved,
      solvedAt: new Date(),
    });

    invalidateStats(userId!, ALL_STATS);
    sendSuccess(res, doc.toObject(), 201);
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
      filter.status = QuestionStatus.Pending;
    } else if (backlog !== "all") {
      filter.status = QuestionStatus.Solved;
    }

    if (req.query.category) filter.category = req.query.category as string;
    if (req.query.status && !filter.status) filter.status = req.query.status as string;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty as string;
    if (req.query.topic) filter.topics = req.query.topic as string;
    if (req.query.source) filter.source = req.query.source as string;
    if (req.query.tag) filter.tags = req.query.tag as string;
    if (req.query.companyTag) filter.companyTags = req.query.companyTag as string;
    if (req.query.starred === "true") filter.starred = true;

    // Date range filters (skip invalid dates)
    if (req.query.solvedAfter || req.query.solvedBefore) {
      const after = req.query.solvedAfter ? new Date(req.query.solvedAfter as string) : null;
      const before = req.query.solvedBefore ? new Date(req.query.solvedBefore as string) : null;
      if ((after && !isNaN(after.getTime())) || (before && !isNaN(before.getTime()))) {
        filter.solvedAt = {};
        if (after && !isNaN(after.getTime())) filter.solvedAt.$gte = after;
        if (before && !isNaN(before.getTime())) filter.solvedAt.$lte = before;
      }
    }
    if (req.query.createdAfter || req.query.createdBefore) {
      const after = req.query.createdAfter ? new Date(req.query.createdAfter as string) : null;
      const before = req.query.createdBefore ? new Date(req.query.createdBefore as string) : null;
      if ((after && !isNaN(after.getTime())) || (before && !isNaN(before.getTime()))) {
        filter.createdAt = {};
        if (after && !isNaN(after.getTime())) filter.createdAt.$gte = after;
        if (before && !isNaN(before.getTime())) filter.createdAt.$lte = before;
      }
    }

    // Sort: ?sort=createdAt|-createdAt|solvedAt|-solvedAt|title|-title|difficulty|-difficulty
    const sortParam = (req.query.sort as string) || "-createdAt";
    const sortDirection = sortParam.startsWith("-") ? -1 : 1;
    const sortField = sortParam.replace(/^-/, "");
    const allowedSorts = ["createdAt", "updatedAt", "solvedAt", "title", "difficulty"];
    const sort: Record<string, 1 | -1> = allowedSorts.includes(sortField)
      ? { [sortField]: sortDirection }
      : { createdAt: -1 };

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [questions, total] = await Promise.all([
      Question.find(filter, LIST_PROJECTION).sort(sort).skip(skip).limit(limit).lean(),
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
    const question = await Question.findOne({ _id: req.params.id, userId }).lean();

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
    const { title, notes, solution, difficulty, topics, source, url, tags, companyTags, category } = req.body;

    const $set: Record<string, any> = {};
    if (title !== undefined) $set.title = title;
    if (notes !== undefined) $set.notes = notes;
    if (solution !== undefined) $set.solution = solution;
    if (difficulty !== undefined) $set.difficulty = difficulty;
    if (topics !== undefined) $set.topics = topics;
    if (source !== undefined) $set.source = source;
    if (url !== undefined) $set.url = url;
    if (tags !== undefined) $set.tags = tags;
    if (companyTags !== undefined) $set.companyTags = companyTags;
    if (category !== undefined) $set.category = category;

    // Auto-solve if solution is added to a pending question
    if (solution) {
      $set.status = QuestionStatus.Solved;
      $set.solvedAt = { $ifNull: ["$solvedAt", new Date()] };
    }

    // Use aggregation pipeline update for conditional solvedAt
    const question = solution
      ? await Question.findOneAndUpdate(
          { _id: req.params.id, userId },
          [{ $set }],
          { new: true }
        ).lean()
      : await Question.findOneAndUpdate(
          { _id: req.params.id, userId },
          { $set },
          { new: true }
        ).lean();

    if (!question) {
      sendError(res, "Question not found", 404);
      return;
    }

    invalidateStats(userId!, solution ? ALL_STATS : METADATA_STATS);
    sendSuccess(res, question);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error updating question");
  }
};

export const deleteQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const question = await Question.findOneAndDelete({ _id: req.params.id, userId });

    if (!question) {
      sendError(res, "Question not found", 404);
      return;
    }

    invalidateStats(userId!, ALL_STATS);
    sendSuccess(res, { message: "Question deleted" });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error deleting question");
  }
};

// ---- Solve ----

export const solveQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { solution } = req.body;
    const question = await Question.findOneAndUpdate(
      { _id: req.params.id, userId, status: { $ne: QuestionStatus.Solved } },
      { $set: { status: QuestionStatus.Solved, solvedAt: new Date(), ...(solution ? { solution } : {}) } },
      { new: true }
    ).lean();

    if (!question) {
      const exists = await Question.exists({ _id: req.params.id, userId });
      if (exists) {
        sendError(res, "Question is already solved", 400);
      } else {
        sendError(res, "Question not found", 404);
      }
      return;
    }

    invalidateStats(userId!, ALL_STATS);
    sendSuccess(res, question);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error solving question");
  }
};

// ---- Reset ----

export const resetQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const question = await Question.findOneAndUpdate(
      { _id: req.params.id, userId, status: QuestionStatus.Solved },
      { $set: { status: QuestionStatus.Pending }, $unset: { solvedAt: 1 } },
      { new: true }
    ).lean();

    if (!question) {
      const exists = await Question.exists({ _id: req.params.id, userId });
      if (exists) {
        sendError(res, "Question is not solved", 400);
      } else {
        sendError(res, "Question not found", 404);
      }
      return;
    }

    invalidateStats(userId!, ALL_STATS);
    sendSuccess(res, question);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error resetting question");
  }
};

// ---- Star ----

export const toggleStarred = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const question = await Question.findOneAndUpdate(
      { _id: req.params.id, userId },
      [{ $set: { starred: { $not: "$starred" } } }],
      { new: true }
    ).lean();

    if (!question) {
      sendError(res, "Question not found", 404);
      return;
    }

    sendSuccess(res, question);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error toggling starred");
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

    const trimmed = q.trim();

    const additionalFilters: Record<string, any> = {};
    if (req.query.status) additionalFilters.status = req.query.status as string;
    if (req.query.difficulty) additionalFilters.difficulty = req.query.difficulty as string;
    if (req.query.category) additionalFilters.category = req.query.category as string;
    if (req.query.source) additionalFilters.source = req.query.source as string;

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    // Case-insensitive regex search on title/topics/tags/companyTags
    // (supports substring matches like "use" matching "useState")
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = { $regex: escaped, $options: "i" };
    const searchFilter = {
      userId,
      $or: [{ title: regex }, { topics: regex }, { tags: regex }, { companyTags: regex }],
      ...additionalFilters,
    };
    const [questions, total] = await Promise.all([
      Question.find(searchFilter, LIST_PROJECTION)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Question.countDocuments(searchFilter),
    ]);

    sendPaginated(res, questions, { page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error searching questions");
  }
};

// ---- Bulk Operations ----

export const bulkDeleteQuestions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      sendError(res, "ids must be a non-empty array", 400);
      return;
    }

    const result = await Question.deleteMany({ _id: { $in: ids }, userId });

    invalidateStats(userId!, ALL_STATS);
    sendSuccess(res, {
      message: `Deleted ${result.deletedCount} questions`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error deleting questions");
  }
};

// ---- Backlog ----

export const createBacklogQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { title, notes, solution, difficulty, topics, source, url, tags, companyTags, category } = req.body;

    const doc = await Question.create({
      userId,
      category,
      title,
      notes,
      solution,
      difficulty,
      topics,
      source,
      url,
      tags,
      companyTags,
    });

    invalidateStats(userId!, BACKLOG_STATS);
    sendSuccess(res, doc.toObject(), 201);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error creating backlog question");
  }
};

export const getBacklogQuestions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const filter: Record<string, any> = { userId, status: QuestionStatus.Pending };

    if (req.query.category) filter.category = req.query.category as string;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty as string;
    if (req.query.topic) filter.topics = req.query.topic as string;
    if (req.query.source) filter.source = req.query.source as string;
    if (req.query.tag) filter.tags = req.query.tag as string;
    if (req.query.companyTag) filter.companyTags = req.query.companyTag as string;
    if (req.query.starred === "true") filter.starred = true;

    const sortParam = (req.query.sort as string) || "-createdAt";
    const sortDirection = sortParam.startsWith("-") ? -1 : 1;
    const sortField = sortParam.replace(/^-/, "");
    const allowedSorts = ["createdAt", "updatedAt", "title", "difficulty"];
    const sort: Record<string, 1 | -1> = allowedSorts.includes(sortField)
      ? { [sortField]: sortDirection }
      : { createdAt: -1 };

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [questions, total] = await Promise.all([
      Question.find(filter, LIST_PROJECTION).sort(sort).skip(skip).limit(limit).lean(),
      Question.countDocuments(filter),
    ]);

    sendPaginated(res, questions, { page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching backlog questions");
  }
};
