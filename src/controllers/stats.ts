import { Response } from "express";
import { Question } from "../models/Question";
import { AuthRequest } from "../types/auth";
import { PrepCategory } from "../types/category";
import { QuestionStatus, Difficulty, QuestionSource } from "../types/question";
import { toISTDateString, toISTMidnight } from "../utils/date";
import { sendSuccess, sendError } from "../utils/response";
import { logger } from "../utils/logger";

/**
 * GET /api/stats/overview
 * Returns high-level counts: total questions, by status, by category, by difficulty.
 */
export const getOverview = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const baseFilter = { userId };

    const [byStatus, byCategory, byDifficulty, total, backlogCount] = await Promise.all([
      Question.aggregate([{ $match: baseFilter }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      Question.aggregate([
        { $match: { ...baseFilter, category: { $ne: null } } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
      Question.aggregate([
        { $match: { ...baseFilter, difficulty: { $ne: null } } },
        { $group: { _id: "$difficulty", count: { $sum: 1 } } },
      ]),
      Question.countDocuments(baseFilter),
      Question.countDocuments({ userId, category: null }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const s of Object.values(QuestionStatus)) statusMap[s] = 0;
    for (const row of byStatus) statusMap[row._id] = row.count;

    const categoryMap: Record<string, number> = {};
    for (const c of Object.values(PrepCategory)) categoryMap[c] = 0;
    for (const row of byCategory) categoryMap[row._id] = row.count;

    const difficultyMap: Record<string, number> = {};
    for (const d of Object.values(Difficulty)) difficultyMap[d] = 0;
    for (const row of byDifficulty) difficultyMap[row._id] = row.count;

    sendSuccess(res, {
      total,
      backlogCount,
      byStatus: statusMap,
      byCategory: categoryMap,
      byDifficulty: difficultyMap,
    });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching overview stats");
  }
};

/**
 * GET /api/stats/categories
 * Returns per-category stats with completion rates.
 */
export const getCategoryBreakdown = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const pipeline = await Question.aggregate([
      { $match: { userId, category: { $ne: null } } },
      {
        $group: {
          _id: { category: "$category", status: "$status" },
          count: { $sum: 1 },
        },
      },
    ]);

    const categories: Record<string, { total: number; solved: number; pending: number }> = {};

    for (const c of Object.values(PrepCategory)) {
      categories[c] = { total: 0, solved: 0, pending: 0 };
    }

    for (const row of pipeline) {
      const cat = row._id.category;
      const status = row._id.status as string;
      if (!categories[cat]) continue;
      categories[cat].total += row.count;
      if (status === QuestionStatus.Solved) categories[cat].solved += row.count;
      else categories[cat].pending += row.count;
    }

    const breakdown = Object.entries(categories).map(([category, stats]) => ({
      category,
      ...stats,
      completionRate: stats.total > 0 ? Math.round((stats.solved / stats.total) * 100) : 0,
    }));

    sendSuccess(res, breakdown);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching category breakdown");
  }
};

/**
 * GET /api/stats/difficulties
 * Returns per-difficulty stats with completion rates.
 */
export const getDifficultyBreakdown = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const pipeline = await Question.aggregate([
      { $match: { userId, difficulty: { $ne: null } } },
      {
        $group: {
          _id: { difficulty: "$difficulty", status: "$status" },
          count: { $sum: 1 },
        },
      },
    ]);

    const difficulties: Record<string, { total: number; solved: number; pending: number }> = {};

    for (const d of Object.values(Difficulty)) {
      difficulties[d] = { total: 0, solved: 0, pending: 0 };
    }

    for (const row of pipeline) {
      const diff = row._id.difficulty;
      const status = row._id.status as string;
      if (!difficulties[diff]) continue;
      difficulties[diff].total += row.count;
      if (status === QuestionStatus.Solved) difficulties[diff].solved += row.count;
      else difficulties[diff].pending += row.count;
    }

    const breakdown = Object.entries(difficulties).map(([difficulty, stats]) => ({
      difficulty,
      ...stats,
      completionRate: stats.total > 0 ? Math.round((stats.solved / stats.total) * 100) : 0,
    }));

    sendSuccess(res, breakdown);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching difficulty breakdown");
  }
};

/**
 * GET /api/stats/topics
 * Returns per-topic breakdown with completion rates.
 */
export const getTopicBreakdown = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const matchFilter: Record<string, any> = {
      userId,
      topic: { $nin: [null, ""] },
    };

    if (req.query.category) {
      matchFilter.category = req.query.category as string;
    }

    const pipeline = await Question.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: { topic: "$topic", status: "$status" },
          count: { $sum: 1 },
        },
      },
    ]);

    const topics: Record<string, { total: number; solved: number; pending: number }> = {};

    for (const row of pipeline) {
      const topic = row._id.topic as string;
      const status = row._id.status as string;
      if (!topics[topic]) {
        topics[topic] = { total: 0, solved: 0, pending: 0 };
      }
      topics[topic].total += row.count;
      if (status === QuestionStatus.Solved) topics[topic].solved += row.count;
      else topics[topic].pending += row.count;
    }

    const breakdown = Object.entries(topics)
      .map(([topic, stats]) => ({
        topic,
        ...stats,
        completionRate: stats.total > 0 ? Math.round((stats.solved / stats.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    sendSuccess(res, breakdown);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching topic breakdown");
  }
};

/**
 * GET /api/stats/progress?days=30
 * Returns daily solved question counts for the last N days (default 30).
 */
export const getProgress = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const days = parseInt(req.query.days as string) || 30;

    const now = new Date();
    now.setDate(now.getDate() - days);
    const startDate = toISTMidnight(now);

    const solved = await Question.aggregate([
      {
        $match: {
          userId,
          status: QuestionStatus.Solved,
          solvedAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const result: Array<{ date: string; solved: number }> = [];
    const solvedMap = new Map(solved.map((s) => [s._id, s.count]));
    const current = new Date(startDate);
    const todayStr = toISTDateString(new Date());

    let dateStr = toISTDateString(current);
    while (dateStr <= todayStr) {
      result.push({
        date: dateStr,
        solved: solvedMap.get(dateStr) || 0,
      });
      current.setDate(current.getDate() + 1);
      dateStr = toISTDateString(current);
    }

    sendSuccess(res, result);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching progress stats");
  }
};

/**
 * GET /api/stats/sources
 * Returns per-source breakdown with completion rates.
 */
export const getSourceBreakdown = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const pipeline = await Question.aggregate([
      { $match: { userId, source: { $nin: [null, ""] } } },
      {
        $group: {
          _id: { source: "$source", status: "$status" },
          count: { $sum: 1 },
        },
      },
    ]);

    const sources: Record<string, { total: number; solved: number; pending: number }> = {};
    for (const s of Object.values(QuestionSource)) {
      sources[s] = { total: 0, solved: 0, pending: 0 };
    }

    for (const row of pipeline) {
      const src = row._id.source;
      const status = row._id.status as string;
      if (!sources[src]) continue;
      sources[src].total += row.count;
      if (status === QuestionStatus.Solved) sources[src].solved += row.count;
      else sources[src].pending += row.count;
    }

    const breakdown = Object.entries(sources).map(([source, stats]) => ({
      source,
      ...stats,
      completionRate: stats.total > 0 ? Math.round((stats.solved / stats.total) * 100) : 0,
    }));

    sendSuccess(res, breakdown);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching source breakdown");
  }
};

/**
 * GET /api/stats/company-tags
 * Returns per-company breakdown with completion rates.
 */
export const getCompanyTagBreakdown = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const pipeline = await Question.aggregate([
      { $match: { userId, companyTags: { $exists: true, $ne: [] } } },
      { $unwind: "$companyTags" },
      {
        $group: {
          _id: { companyTag: "$companyTags", status: "$status" },
          count: { $sum: 1 },
        },
      },
    ]);

    const companies: Record<string, { total: number; solved: number; pending: number }> = {};

    for (const row of pipeline) {
      const company = row._id.companyTag as string;
      const status = row._id.status as string;
      if (!companies[company]) {
        companies[company] = { total: 0, solved: 0, pending: 0 };
      }
      companies[company].total += row.count;
      if (status === QuestionStatus.Solved) companies[company].solved += row.count;
      else companies[company].pending += row.count;
    }

    const breakdown = Object.entries(companies)
      .map(([companyTag, stats]) => ({
        companyTag,
        ...stats,
        completionRate: stats.total > 0 ? Math.round((stats.solved / stats.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    sendSuccess(res, breakdown);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching company tag breakdown");
  }
};

/**
 * GET /api/stats/tags
 * Returns per-tag breakdown with completion rates.
 */
export const getTagBreakdown = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const pipeline = await Question.aggregate([
      { $match: { userId, tags: { $exists: true, $ne: [] } } },
      { $unwind: "$tags" },
      {
        $group: {
          _id: { tag: "$tags", status: "$status" },
          count: { $sum: 1 },
        },
      },
    ]);

    const tags: Record<string, { total: number; solved: number; pending: number }> = {};

    for (const row of pipeline) {
      const tag = row._id.tag as string;
      const status = row._id.status as string;
      if (!tags[tag]) {
        tags[tag] = { total: 0, solved: 0, pending: 0 };
      }
      tags[tag].total += row.count;
      if (status === QuestionStatus.Solved) tags[tag].solved += row.count;
      else tags[tag].pending += row.count;
    }

    const breakdown = Object.entries(tags)
      .map(([tag, stats]) => ({
        tag,
        ...stats,
        completionRate: stats.total > 0 ? Math.round((stats.solved / stats.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    sendSuccess(res, breakdown);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching tag breakdown");
  }
};

/**
 * GET /api/stats/heatmap?year=2026
 * Returns GitHub-style contribution heatmap data for the given year.
 */
export const getHeatmap = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const parsedYear = parseInt(req.query.year as string);
    const year = parsedYear >= 2000 && parsedYear <= 2100 ? parsedYear : new Date().getFullYear();

    const startDate = new Date(`${year}-01-01T00:00:00.000+05:30`);
    const endDate = new Date(`${year + 1}-01-01T00:00:00.000+05:30`);

    const solved = await Question.aggregate([
      {
        $match: {
          userId,
          status: QuestionStatus.Solved,
          solvedAt: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt" } },
          count: { $sum: 1 },
        },
      },
    ]);

    const solvedMap = new Map(solved.map((s) => [s._id, s.count]));
    const heatmap: Record<string, number> = {};

    const current = new Date(startDate);
    while (current < endDate) {
      const dateStr = toISTDateString(current);
      heatmap[dateStr] = solvedMap.get(dateStr) || 0;
      current.setDate(current.getDate() + 1);
    }

    sendSuccess(res, heatmap);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching heatmap stats");
  }
};

/**
 * GET /api/stats/weekly-progress?weeks=12
 * Returns weekly aggregated solved counts for the last N weeks.
 */
export const getWeeklyProgress = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const weeks = parseInt(req.query.weeks as string) || 12;

    const now = new Date();
    const startDate = toISTMidnight(now);
    startDate.setDate(startDate.getDate() - weeks * 7);

    const solved = await Question.aggregate([
      {
        $match: {
          userId,
          status: QuestionStatus.Solved,
          solvedAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%G-W%V", date: "$solvedAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const solvedMap = new Map(solved.map((s) => [s._id, s.count]));
    const result: Array<{ week: string; startDate: string; solved: number }> = [];

    // Walk week by week from startDate
    const current = new Date(startDate);
    // Align to Monday
    const day = current.getDay();
    current.setDate(current.getDate() - ((day + 6) % 7));

    const todayStr = toISTDateString(new Date());
    while (toISTDateString(current) <= todayStr) {
      const weekStart = toISTDateString(current);
      // Compute ISO week string
      const temp = new Date(current);
      temp.setDate(temp.getDate() + 3 - ((temp.getDay() + 6) % 7));
      const yearStart = new Date(temp.getFullYear(), 0, 4);
      const weekNum = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
      const weekStr = `${temp.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;

      result.push({
        week: weekStr,
        startDate: weekStart,
        solved: solvedMap.get(weekStr) || 0,
      });
      current.setDate(current.getDate() + 7);
    }

    sendSuccess(res, result);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching weekly progress");
  }
};

/**
 * GET /api/stats/cumulative-progress?days=90
 * Returns running total of solved questions over time.
 */
export const getCumulativeProgress = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const days = parseInt(req.query.days as string) || 90;

    const now = new Date();
    now.setDate(now.getDate() - days);
    const startDate = toISTMidnight(now);

    // Count questions solved before the window
    const priorCount = await Question.countDocuments({
      userId,
      status: QuestionStatus.Solved,
      solvedAt: { $lt: startDate },
    });

    // Daily solved within the window
    const daily = await Question.aggregate([
      {
        $match: {
          userId,
          status: QuestionStatus.Solved,
          solvedAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const dailyMap = new Map(daily.map((d) => [d._id, d.count]));
    const result: Array<{ date: string; total: number }> = [];

    let runningTotal = priorCount;
    const current = new Date(startDate);
    const todayStr = toISTDateString(new Date());

    let dateStr = toISTDateString(current);
    while (dateStr <= todayStr) {
      runningTotal += dailyMap.get(dateStr) || 0;
      result.push({ date: dateStr, total: runningTotal });
      current.setDate(current.getDate() + 1);
      dateStr = toISTDateString(current);
    }

    sendSuccess(res, result);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching cumulative progress");
  }
};

/**
 * GET /api/stats/difficulty-by-category
 * Returns cross-tabulation of difficulty x category for stacked/radar charts.
 */
export const getDifficultyByCategory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const pipeline = await Question.aggregate([
      { $match: { userId, category: { $ne: null }, difficulty: { $ne: null } } },
      {
        $group: {
          _id: { category: "$category", difficulty: "$difficulty" },
          count: { $sum: 1 },
        },
      },
    ]);

    const categories: Record<string, { easy: number; medium: number; hard: number }> = {};
    for (const c of Object.values(PrepCategory)) {
      categories[c] = { easy: 0, medium: 0, hard: 0 };
    }

    for (const row of pipeline) {
      const cat = row._id.category;
      const diff = row._id.difficulty as string;
      if (!categories[cat]) continue;
      if (diff === Difficulty.Easy) categories[cat].easy += row.count;
      else if (diff === Difficulty.Medium) categories[cat].medium += row.count;
      else if (diff === Difficulty.Hard) categories[cat].hard += row.count;
    }

    const breakdown = Object.entries(categories).map(([category, counts]) => ({
      category,
      ...counts,
      total: counts.easy + counts.medium + counts.hard,
    }));

    sendSuccess(res, breakdown);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching difficulty by category");
  }
};
