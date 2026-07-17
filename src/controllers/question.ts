import { Response } from "express";
import { Question } from "../models/Question";
import { AuthRequest } from "../types/auth";
import { QuestionStatus } from "../types/question";
import { PrepCategory, SOLUTION_OPTIONAL_CATEGORIES } from "../types/category";
import { sendSuccess, sendPaginated, sendError } from "../utils/response";
import { logger } from "../utils/logger";
import { cache } from "../utils/cache";
import {
  hasSolutionContent,
  normalizeSolutions,
  getMultipleSolutionsError,
  hasMultipleSolutions,
} from "../utils/solution";
import { paginatedList, userStatsStages, STATS_CACHE_TTL_MS, LIST_PROJECTION, toListQuestion } from "../utils/aggregation";

// Granular cache invalidation groups
const ALL_STATS = [
  "overview",
  "categories",
  "difficulties",
  "topics",
  "sources",
  "companyTags",
  "tags",
  "progress",
  "weeklyProgress",
  "cumulativeProgress",
  "heatmap",
  "difficultyByCategory",
  "streaks",
  "insights",
  "batch",
] as const;
const BACKLOG_STATS = ["overview", "insights", "batch"] as const;
const METADATA_STATS = [
  "overview",
  "categories",
  "difficulties",
  "topics",
  "sources",
  "companyTags",
  "tags",
  "difficultyByCategory",
  "insights",
  "batch",
] as const;

const invalidateStats = async (userId: string, keys: readonly string[]) => {
  await Promise.all([
    ...keys.map((key) => cache.invalidate(`stats:${userId}:${key}`)),
    cache.invalidate(`suggestions:v3:${userId}`),
  ]);
};

// ---- CRUD ----

export const createQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { title, notes, solutions, difficulty, topics, source, url, tags, companyTags, category } = req.body;

    const multipleSolutionsError = getMultipleSolutionsError(category, { solutions });
    if (multipleSolutionsError) {
      sendError(res, multipleSolutionsError, 400);
      return;
    }

    const normalizedSolutions = normalizeSolutions({ solutions });

    const doc = await Question.create({
      userId,
      category,
      title,
      notes,
      ...normalizedSolutions,
      difficulty,
      topics,
      source,
      url,
      tags,
      companyTags,
      status: QuestionStatus.Solved,
      solvedAt: new Date(),
    });

    await invalidateStats(userId!, ALL_STATS);
    sendSuccess(res, toListQuestion(doc.toObject()), 201);
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

    const { items: questions, total } = await paginatedList(Question, filter, sort, skip, limit);

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
    const { title, notes, solutions, difficulty, topics, source, url, tags, companyTags, category } = req.body;

    const updatingSolutions = solutions !== undefined;
    if (updatingSolutions && hasMultipleSolutions({ solutions })) {
      let effectiveCategory = category;
      if (effectiveCategory === undefined) {
        const existing = await Question.findOne({ _id: req.params.id, userId }, { category: 1 }).lean();
        if (!existing) {
          sendError(res, "Question not found", 404);
          return;
        }
        effectiveCategory = existing.category;
      }

      const multipleSolutionsError = getMultipleSolutionsError(effectiveCategory, { solutions });
      if (multipleSolutionsError) {
        sendError(res, multipleSolutionsError, 400);
        return;
      }
    }

    const $set: Record<string, any> = {};
    if (title !== undefined) $set.title = title;
    if (notes !== undefined) $set.notes = notes;
    if (solutions !== undefined) {
      Object.assign($set, normalizeSolutions({ solutions }));
    }
    if (difficulty !== undefined) $set.difficulty = difficulty;
    if (topics !== undefined) $set.topics = topics;
    if (source !== undefined) $set.source = source;
    if (url !== undefined) $set.url = url;
    if (tags !== undefined) $set.tags = tags;
    if (companyTags !== undefined) $set.companyTags = companyTags;
    if (category !== undefined) $set.category = category;

    const solutionAdded = hasSolutionContent({ solutions });
    if (solutionAdded) {
      $set.status = QuestionStatus.Solved;
      $set.solvedAt = { $ifNull: ["$solvedAt", new Date()] };
    }

    // Use aggregation pipeline update for conditional solvedAt
    const question = solutionAdded
      ? await Question.findOneAndUpdate({ _id: req.params.id, userId }, [{ $set }], {
          new: true,
          projection: LIST_PROJECTION,
        }).lean()
      : await Question.findOneAndUpdate({ _id: req.params.id, userId }, { $set }, {
          new: true,
          projection: LIST_PROJECTION,
        }).lean();

    if (!question) {
      sendError(res, "Question not found", 404);
      return;
    }

    await invalidateStats(userId!, solutionAdded ? ALL_STATS : METADATA_STATS);
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

    await invalidateStats(userId!, ALL_STATS);
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
    const { solutions } = req.body;

    const existing = await Question.findOne(
      { _id: req.params.id, userId },
      { status: 1, category: 1 }
    ).lean();
    if (!existing) {
      sendError(res, "Question not found", 404);
      return;
    }
    if (existing.status === QuestionStatus.Solved) {
      sendError(res, "Question is already solved", 400);
      return;
    }

    const solutionRequired = !SOLUTION_OPTIONAL_CATEGORIES.includes(existing.category as PrepCategory);
    if (solutionRequired && !hasSolutionContent({ solutions })) {
      sendError(res, "Solution is required for this category", 400);
      return;
    }

    const multipleSolutionsError = getMultipleSolutionsError(existing.category, { solutions });
    if (multipleSolutionsError) {
      sendError(res, multipleSolutionsError, 400);
      return;
    }

    const normalizedSolutions = normalizeSolutions({ solutions });

    const question = await Question.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: { status: QuestionStatus.Solved, solvedAt: new Date(), ...normalizedSolutions } },
      { new: true, projection: LIST_PROJECTION }
    ).lean();

    await invalidateStats(userId!, ALL_STATS);
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
      { new: true, projection: LIST_PROJECTION }
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

    await invalidateStats(userId!, ALL_STATS);
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
      { new: true, projection: LIST_PROJECTION }
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

    // Prefer text index for word/token search; regex for short/substring queries
    const canUseTextIndex =
      trimmed.length >= 3 && /^[a-zA-Z0-9][a-zA-Z0-9\s\-_]*$/.test(trimmed);

    let searchFilter: Record<string, unknown>;
    let sort: Record<string, 1 | -1 | { $meta: "textScore" }>;

    if (canUseTextIndex) {
      searchFilter = { userId, $text: { $search: trimmed }, ...additionalFilters };
      sort = { score: { $meta: "textScore" }, createdAt: -1 };
    } else {
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = { $regex: escaped, $options: "i" };
      searchFilter = {
        userId,
        $or: [{ title: regex }, { topics: regex }, { tags: regex }, { companyTags: regex }],
        ...additionalFilters,
      };
      sort = { createdAt: -1 };
    }

    const { items: questions, total } = await paginatedList(Question, searchFilter, sort, skip, limit);

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

    await invalidateStats(userId!, ALL_STATS);
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
    const { title, notes, solutions, difficulty, topics, source, url, tags, companyTags, category } = req.body;

    const multipleSolutionsError = getMultipleSolutionsError(category, { solutions });
    if (multipleSolutionsError) {
      sendError(res, multipleSolutionsError, 400);
      return;
    }

    const normalizedSolutions = normalizeSolutions({ solutions });

    const doc = await Question.create({
      userId,
      category,
      title,
      notes,
      ...normalizedSolutions,
      difficulty,
      topics,
      source,
      url,
      tags,
      companyTags,
    });

    await invalidateStats(userId!, BACKLOG_STATS);
    sendSuccess(res, toListQuestion(doc.toObject()), 201);
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

    const { items: questions, total } = await paginatedList(Question, filter, sort, skip, limit);

    sendPaginated(res, questions, { page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching backlog questions");
  }
};

// ---- Suggestions ----

const DEFAULT_TAGS = [
  "revisit",
  "tricky",
  "important",
  "weak-area",
  "interview-ready",
  "needs-review",
  "top-interview",
  "asked-in-interview",
  "follow-up",
];

const SUGGESTION_CATEGORIES = Object.values(PrepCategory);

const mergeDefaults = (userItems: string[], defaults: string[]): string[] => {
  const seen = new Set(userItems.map((s) => s.toLowerCase()));
  for (const item of defaults) {
    if (!seen.has(item.toLowerCase())) {
      userItems.push(item);
      seen.add(item.toLowerCase());
    }
  }
  return userItems;
};

export const getSuggestions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const cacheKey = `suggestions:v3:${userId}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      sendSuccess(res, cached);
      return;
    }

    const [f] = await Question.aggregate([
      ...userStatsStages(userId!),
      {
        $facet: {
          topicsByCategory: [
            { $match: { topics: { $exists: true, $ne: [] }, category: { $ne: null } } },
            { $unwind: "$topics" },
            { $group: { _id: { category: "$category", topic: { $toLower: "$topics" } }, count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $group: { _id: "$_id.category", topics: { $push: "$_id.topic" } } },
          ],
          tagsByCategory: [
            { $match: { tags: { $exists: true, $ne: [] }, category: { $ne: null } } },
            { $unwind: "$tags" },
            {
              $group: {
                _id: { category: "$category", tag: { $toLower: "$tags" } },
                // Prefer canonical casing from normalizeTags (e.g. useState)
                tag: { $first: "$tags" },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            {
              $group: {
                _id: "$_id.category",
                tags: { $push: "$tag" },
              },
            },
          ],
          tags: [
            { $match: { tags: { $exists: true, $ne: [] } } },
            { $unwind: "$tags" },
            {
              $group: {
                _id: { $toLower: "$tags" },
                tag: { $first: "$tags" },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 50 },
            { $project: { _id: 0, tag: 1 } },
          ],
          companyTags: [
            { $match: { companyTags: { $exists: true, $ne: [] } } },
            { $unwind: "$companyTags" },
            {
              $group: {
                _id: { key: { $toLower: "$companyTags" }, company: "$companyTags" },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1, "_id.company": 1 } },
            {
              $group: {
                _id: "$_id.key",
                company: { $first: "$_id.company" },
                count: { $sum: "$count" },
              },
            },
            { $sort: { count: -1, company: 1 } },
            { $project: { _id: 0, company: 1 } },
          ],
        },
      },
    ]);

    const topicsByCategory: Record<string, string[]> = {};
    const tagsByCategory: Record<string, string[]> = {};

    for (const cat of SUGGESTION_CATEGORIES) {
      const topicRow = f.topicsByCategory.find((r: any) => r._id === cat);
      // User topics only — no hardcoded topic presets
      topicsByCategory[cat] = topicRow ? topicRow.topics.slice(0, 40) : [];

      const tagRow = f.tagsByCategory.find((r: any) => r._id === cat);
      const userTags = tagRow ? tagRow.tags.slice(0, 40) : [];
      tagsByCategory[cat] = mergeDefaults(userTags, DEFAULT_TAGS);
    }

    const result = {
      topicsByCategory,
      tagsByCategory,
      // Flat list kept for older clients — global defaults + top user tags
      tags: mergeDefaults(
        f.tags.map((t: any) => t.tag),
        DEFAULT_TAGS
      ),
      companyTags: f.companyTags.map((c: any) => c.company),
    };

    await cache.set(cacheKey, result, STATS_CACHE_TTL_MS);
    sendSuccess(res, result);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching suggestions");
  }
};
