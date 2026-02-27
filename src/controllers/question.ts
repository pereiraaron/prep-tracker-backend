import { Response } from "express";
import { Question } from "../models/Question";
import { AuthRequest } from "../types/auth";
import { QuestionStatus } from "../types/question";
import { sendSuccess, sendPaginated, sendError } from "../utils/response";
import { logger } from "../utils/logger";

// ---- CRUD ----

export const createQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { title, notes, solution, difficulty, topic, source, url, tags, companyTags, category } = req.body;

    const question = await Question.create({
      userId,
      category,
      title,
      notes,
      solution,
      difficulty,
      topic,
      source,
      url,
      tags,
      companyTags,
      status: QuestionStatus.Solved,
      solvedAt: new Date(),
    });

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
      filter.category = null;
    } else if (backlog !== "all") {
      filter.category = { $ne: null };
    }

    if (req.query.category && !filter.category) filter.category = req.query.category as string;
    if (req.query.status) filter.status = req.query.status as string;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty as string;
    if (req.query.topic) filter.topic = req.query.topic as string;
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
    const allowedSorts = ["createdAt", "updatedAt", "solvedAt", "title", "difficulty", "topic"];
    const sort: Record<string, 1 | -1> = allowedSorts.includes(sortField)
      ? { [sortField]: sortDirection }
      : { createdAt: -1 };

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [questions, total] = await Promise.all([
      Question.find(filter).sort(sort).skip(skip).limit(limit),
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
    const { title, notes, solution, difficulty, topic, source, url, tags, companyTags, category } = req.body;

    const question = await Question.findOne({ _id: req.params.id, userId });
    if (!question) {
      sendError(res, "Question not found", 404);
      return;
    }

    if (title !== undefined) question.title = title;
    if (notes !== undefined) question.notes = notes;
    if (solution !== undefined) question.solution = solution;
    if (difficulty !== undefined) question.difficulty = difficulty;
    if (topic !== undefined) question.topic = topic;
    if (source !== undefined) question.source = source;
    if (url !== undefined) question.url = url;
    if (tags !== undefined) question.tags = tags;
    if (companyTags !== undefined) question.companyTags = companyTags;
    if (category !== undefined) question.category = category;

    await question.save();

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
    const question = await Question.findOne({ _id: req.params.id, userId });

    if (!question) {
      sendError(res, "Question not found", 404);
      return;
    }

    if (question.status === QuestionStatus.Solved) {
      sendError(res, "Question is already solved", 400);
      return;
    }

    question.status = QuestionStatus.Solved;
    question.solvedAt = new Date();
    await question.save();

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
    const question = await Question.findOne({ _id: req.params.id, userId });

    if (!question) {
      sendError(res, "Question not found", 404);
      return;
    }

    if (question.status !== QuestionStatus.Solved) {
      sendError(res, "Question is not solved", 400);
      return;
    }

    question.status = QuestionStatus.Pending;
    question.solvedAt = undefined;
    await question.save();

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
        { companyTags: regex },
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
    const { title, notes, solution, difficulty, topic, source, url, tags, companyTags } = req.body;

    const question = await Question.create({
      userId,
      category: null,
      title,
      notes,
      solution,
      difficulty,
      topic,
      source,
      url,
      tags,
      companyTags,
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
    const filter: Record<string, any> = { userId, category: null };

    if (req.query.status) filter.status = req.query.status as string;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty as string;
    if (req.query.topic) filter.topic = req.query.topic as string;
    if (req.query.source) filter.source = req.query.source as string;
    if (req.query.tag) filter.tags = req.query.tag as string;
    if (req.query.companyTag) filter.companyTags = req.query.companyTag as string;
    if (req.query.starred === "true") filter.starred = true;

    const sortParam = (req.query.sort as string) || "-createdAt";
    const sortDirection = sortParam.startsWith("-") ? -1 : 1;
    const sortField = sortParam.replace(/^-/, "");
    const allowedSorts = ["createdAt", "updatedAt", "title", "difficulty", "topic"];
    const sort: Record<string, 1 | -1> = allowedSorts.includes(sortField)
      ? { [sortField]: sortDirection }
      : { createdAt: -1 };

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [questions, total] = await Promise.all([
      Question.find(filter).sort(sort).skip(skip).limit(limit),
      Question.countDocuments(filter),
    ]);

    sendPaginated(res, questions, { page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching backlog questions");
  }
};
