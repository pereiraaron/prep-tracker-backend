import { Response } from "express";
import { Question } from "../models/Question";
import { AuthRequest } from "../types/auth";
import { PrepCategory } from "../types/category";
import { QuestionStatus, Difficulty, QuestionSource } from "../types/question";
import { toISTDateString, toISTMidnight } from "../utils/date";
import { sendSuccess, sendError } from "../utils/response";
import { logger } from "../utils/logger";
import { cache } from "../utils/cache";

/**
 * GET /api/stats/overview
 * Returns high-level counts: total questions, by status, by category, by difficulty.
 */
export const getOverview = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const cacheKey = `stats:${userId}:overview`;

    if (req.query.refresh !== "true") {
      const cached = cache.get(cacheKey);
      if (cached) {
        sendSuccess(res, cached);
        return;
      }
    }

    const [facetResult] = await Question.aggregate([
      { $match: { userId } },
      {
        $facet: {
          byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          byCategory: [{ $match: { category: { $ne: null } } }, { $group: { _id: "$category", count: { $sum: 1 } } }],
          byDifficulty: [
            { $match: { difficulty: { $ne: null } } },
            { $group: { _id: "$difficulty", count: { $sum: 1 } } },
          ],
          total: [{ $count: "count" }],
          backlog: [{ $match: { category: null } }, { $count: "count" }],
        },
      },
    ]);

    const byStatus = facetResult.byStatus;
    const byCategory = facetResult.byCategory;
    const byDifficulty = facetResult.byDifficulty;
    const total = facetResult.total[0]?.count ?? 0;
    const backlogCount = facetResult.backlog[0]?.count ?? 0;

    const statusMap: Record<string, number> = {};
    for (const s of Object.values(QuestionStatus)) statusMap[s] = 0;
    for (const row of byStatus) statusMap[row._id] = row.count;

    const categoryMap: Record<string, number> = {};
    for (const c of Object.values(PrepCategory)) categoryMap[c] = 0;
    for (const row of byCategory) categoryMap[row._id] = row.count;

    const difficultyMap: Record<string, number> = {};
    for (const d of Object.values(Difficulty)) difficultyMap[d] = 0;
    for (const row of byDifficulty) difficultyMap[row._id] = row.count;

    const data = {
      total,
      backlogCount,
      byStatus: statusMap,
      byCategory: categoryMap,
      byDifficulty: difficultyMap,
    };
    cache.set(cacheKey, data);
    sendSuccess(res, data);
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
    const cacheKey = `stats:${userId}:categories`;

    if (req.query.refresh !== "true") {
      const cached = cache.get(cacheKey);
      if (cached) {
        sendSuccess(res, cached);
        return;
      }
    }

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

    cache.set(cacheKey, breakdown);
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
    const cacheKey = `stats:${userId}:difficulties`;

    if (req.query.refresh !== "true") {
      const cached = cache.get(cacheKey);
      if (cached) {
        sendSuccess(res, cached);
        return;
      }
    }

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

    cache.set(cacheKey, breakdown);
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
 * GET /api/stats/streaks
 * Returns current streak, longest streak, and total active days.
 */
export const getStreaks = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const solved = await Question.aggregate([
      { $match: { userId, status: QuestionStatus.Solved, solvedAt: { $ne: null } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt" } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    if (solved.length === 0) {
      sendSuccess(res, { currentStreak: 0, longestStreak: 0, totalActiveDays: 0 });
      return;
    }

    const dates = solved.map((s) => s._id as string);
    const totalActiveDays = dates.length;

    // Compute longest streak
    let longestStreak = 1;
    let currentRun = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diffDays = (curr.getTime() - prev.getTime()) / 86400000;
      if (diffDays === 1) {
        currentRun++;
      } else {
        currentRun = 1;
      }
      if (currentRun > longestStreak) longestStreak = currentRun;
    }

    // Compute current streak (walk backward from today)
    const today = toISTMidnight(new Date());
    let currentStreak = 0;
    const dateSet = new Set(dates);
    const latestDate = new Date(`${dates[dates.length - 1]}T00:00:00.000+05:30`);
    const daysSinceLatest = Math.round((today.getTime() - latestDate.getTime()) / 86400000);

    if (daysSinceLatest <= 1) {
      const checkDate = new Date(latestDate);
      while (dateSet.has(toISTDateString(checkDate))) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      }
    }

    sendSuccess(res, { currentStreak, longestStreak, totalActiveDays });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching streak stats");
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

    const [facetResult] = await Question.aggregate([
      { $match: { userId, status: QuestionStatus.Solved, solvedAt: { $ne: null } } },
      {
        $facet: {
          priorCount: [{ $match: { solvedAt: { $lt: startDate } } }, { $count: "count" }],
          daily: [
            { $match: { solvedAt: { $gte: startDate } } },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt" } },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    const priorCount = facetResult.priorCount[0]?.count ?? 0;
    const dailyMap = new Map(facetResult.daily.map((d: any) => [d._id, d.count]));
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

// ---- Batch ----

/**
 * GET /api/stats/batch?keys=overview,categories,difficulties,...
 * Returns multiple stat sections in a single request.
 * Accepts a comma-separated `keys` query param. If omitted, returns all.
 */
export const getBatch = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const requestedKeys = req.query.keys
      ? (req.query.keys as string).split(",").map((k) => k.trim())
      : null;

    const shouldInclude = (key: string) => !requestedKeys || requestedKeys.includes(key);

    const tasks: Record<string, () => Promise<any>> = {};

    if (shouldInclude("overview")) {
      tasks.overview = async () => {
        const cacheKey = `stats:${userId}:overview`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        const [facetResult] = await Question.aggregate([
          { $match: { userId } },
          {
            $facet: {
              byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
              byCategory: [{ $match: { category: { $ne: null } } }, { $group: { _id: "$category", count: { $sum: 1 } } }],
              byDifficulty: [{ $match: { difficulty: { $ne: null } } }, { $group: { _id: "$difficulty", count: { $sum: 1 } } }],
              total: [{ $count: "count" }],
              backlog: [{ $match: { category: null } }, { $count: "count" }],
            },
          },
        ]);

        const statusMap: Record<string, number> = {};
        for (const s of Object.values(QuestionStatus)) statusMap[s] = 0;
        for (const row of facetResult.byStatus) statusMap[row._id] = row.count;

        const categoryMap: Record<string, number> = {};
        for (const c of Object.values(PrepCategory)) categoryMap[c] = 0;
        for (const row of facetResult.byCategory) categoryMap[row._id] = row.count;

        const difficultyMap: Record<string, number> = {};
        for (const d of Object.values(Difficulty)) difficultyMap[d] = 0;
        for (const row of facetResult.byDifficulty) difficultyMap[row._id] = row.count;

        const data = {
          total: facetResult.total[0]?.count ?? 0,
          backlogCount: facetResult.backlog[0]?.count ?? 0,
          byStatus: statusMap,
          byCategory: categoryMap,
          byDifficulty: difficultyMap,
        };
        cache.set(cacheKey, data);
        return data;
      };
    }

    if (shouldInclude("categories")) {
      tasks.categories = async () => {
        const cacheKey = `stats:${userId}:categories`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        const pipeline = await Question.aggregate([
          { $match: { userId, category: { $ne: null } } },
          { $group: { _id: { category: "$category", status: "$status" }, count: { $sum: 1 } } },
        ]);
        const categories: Record<string, { total: number; solved: number; pending: number }> = {};
        for (const c of Object.values(PrepCategory)) categories[c] = { total: 0, solved: 0, pending: 0 };
        for (const row of pipeline) {
          const cat = row._id.category;
          if (!categories[cat]) continue;
          categories[cat].total += row.count;
          if (row._id.status === QuestionStatus.Solved) categories[cat].solved += row.count;
          else categories[cat].pending += row.count;
        }
        const breakdown = Object.entries(categories).map(([category, stats]) => ({
          category, ...stats, completionRate: stats.total > 0 ? Math.round((stats.solved / stats.total) * 100) : 0,
        }));
        cache.set(cacheKey, breakdown);
        return breakdown;
      };
    }

    if (shouldInclude("difficulties")) {
      tasks.difficulties = async () => {
        const cacheKey = `stats:${userId}:difficulties`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        const pipeline = await Question.aggregate([
          { $match: { userId, difficulty: { $ne: null } } },
          { $group: { _id: { difficulty: "$difficulty", status: "$status" }, count: { $sum: 1 } } },
        ]);
        const difficulties: Record<string, { total: number; solved: number; pending: number }> = {};
        for (const d of Object.values(Difficulty)) difficulties[d] = { total: 0, solved: 0, pending: 0 };
        for (const row of pipeline) {
          const diff = row._id.difficulty;
          if (!difficulties[diff]) continue;
          difficulties[diff].total += row.count;
          if (row._id.status === QuestionStatus.Solved) difficulties[diff].solved += row.count;
          else difficulties[diff].pending += row.count;
        }
        const breakdown = Object.entries(difficulties).map(([difficulty, stats]) => ({
          difficulty, ...stats, completionRate: stats.total > 0 ? Math.round((stats.solved / stats.total) * 100) : 0,
        }));
        cache.set(cacheKey, breakdown);
        return breakdown;
      };
    }

    if (shouldInclude("progress")) {
      tasks.progress = async () => {
        const days = 14;
        const now = new Date();
        now.setDate(now.getDate() - days);
        const startDate = toISTMidnight(now);
        const solved = await Question.aggregate([
          { $match: { userId, status: QuestionStatus.Solved, solvedAt: { $gte: startDate } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt" } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]);
        const solvedMap = new Map(solved.map((s) => [s._id, s.count]));
        const result: Array<{ date: string; solved: number }> = [];
        const current = new Date(startDate);
        const todayStr = toISTDateString(new Date());
        let dateStr = toISTDateString(current);
        while (dateStr <= todayStr) {
          result.push({ date: dateStr, solved: solvedMap.get(dateStr) || 0 });
          current.setDate(current.getDate() + 1);
          dateStr = toISTDateString(current);
        }
        return result;
      };
    }

    if (shouldInclude("weeklyProgress")) {
      tasks.weeklyProgress = async () => {
        const weeks = 12;
        const now = new Date();
        const startDate = toISTMidnight(now);
        startDate.setDate(startDate.getDate() - weeks * 7);
        const solved = await Question.aggregate([
          { $match: { userId, status: QuestionStatus.Solved, solvedAt: { $gte: startDate } } },
          { $group: { _id: { $dateToString: { format: "%G-W%V", date: "$solvedAt" } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]);
        const solvedMap = new Map(solved.map((s) => [s._id, s.count]));
        const result: Array<{ week: string; startDate: string; solved: number }> = [];
        const current = new Date(startDate);
        const day = current.getDay();
        current.setDate(current.getDate() - ((day + 6) % 7));
        const todayStr = toISTDateString(new Date());
        while (toISTDateString(current) <= todayStr) {
          const weekStart = toISTDateString(current);
          const temp = new Date(current);
          temp.setDate(temp.getDate() + 3 - ((temp.getDay() + 6) % 7));
          const yearStart = new Date(temp.getFullYear(), 0, 4);
          const weekNum = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
          const weekStr = `${temp.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
          result.push({ week: weekStr, startDate: weekStart, solved: solvedMap.get(weekStr) || 0 });
          current.setDate(current.getDate() + 7);
        }
        return result;
      };
    }

    if (shouldInclude("cumulativeProgress")) {
      tasks.cumulativeProgress = async () => {
        const days = 90;
        const now = new Date();
        now.setDate(now.getDate() - days);
        const startDate = toISTMidnight(now);
        const [facetResult] = await Question.aggregate([
          { $match: { userId, status: QuestionStatus.Solved, solvedAt: { $ne: null } } },
          {
            $facet: {
              priorCount: [{ $match: { solvedAt: { $lt: startDate } } }, { $count: "count" }],
              daily: [
                { $match: { solvedAt: { $gte: startDate } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt" } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
              ],
            },
          },
        ]);
        const priorCount = facetResult.priorCount[0]?.count ?? 0;
        const dailyMap = new Map(facetResult.daily.map((d: any) => [d._id, d.count]));
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
        return result;
      };
    }

    if (shouldInclude("topics")) {
      tasks.topics = async () => {
        const pipeline = await Question.aggregate([
          { $match: { userId, topic: { $nin: [null, ""] } } },
          { $group: { _id: { topic: "$topic", status: "$status" }, count: { $sum: 1 } } },
        ]);
        const topics: Record<string, { total: number; solved: number; pending: number }> = {};
        for (const row of pipeline) {
          const topic = row._id.topic as string;
          if (!topics[topic]) topics[topic] = { total: 0, solved: 0, pending: 0 };
          topics[topic].total += row.count;
          if (row._id.status === QuestionStatus.Solved) topics[topic].solved += row.count;
          else topics[topic].pending += row.count;
        }
        return Object.entries(topics)
          .map(([topic, stats]) => ({ topic, ...stats, completionRate: stats.total > 0 ? Math.round((stats.solved / stats.total) * 100) : 0 }))
          .sort((a, b) => b.total - a.total);
      };
    }

    if (shouldInclude("sources")) {
      tasks.sources = async () => {
        const pipeline = await Question.aggregate([
          { $match: { userId, source: { $nin: [null, ""] } } },
          { $group: { _id: { source: "$source", status: "$status" }, count: { $sum: 1 } } },
        ]);
        const sources: Record<string, { total: number; solved: number; pending: number }> = {};
        for (const s of Object.values(QuestionSource)) sources[s] = { total: 0, solved: 0, pending: 0 };
        for (const row of pipeline) {
          const src = row._id.source;
          if (!sources[src]) continue;
          sources[src].total += row.count;
          if (row._id.status === QuestionStatus.Solved) sources[src].solved += row.count;
          else sources[src].pending += row.count;
        }
        return Object.entries(sources).map(([source, stats]) => ({
          source, ...stats, completionRate: stats.total > 0 ? Math.round((stats.solved / stats.total) * 100) : 0,
        }));
      };
    }

    if (shouldInclude("companyTags")) {
      tasks.companyTags = async () => {
        const pipeline = await Question.aggregate([
          { $match: { userId, companyTags: { $exists: true, $ne: [] } } },
          { $unwind: "$companyTags" },
          { $group: { _id: { companyTag: "$companyTags", status: "$status" }, count: { $sum: 1 } } },
        ]);
        const companies: Record<string, { total: number; solved: number; pending: number }> = {};
        for (const row of pipeline) {
          const company = row._id.companyTag as string;
          if (!companies[company]) companies[company] = { total: 0, solved: 0, pending: 0 };
          companies[company].total += row.count;
          if (row._id.status === QuestionStatus.Solved) companies[company].solved += row.count;
          else companies[company].pending += row.count;
        }
        return Object.entries(companies)
          .map(([companyTag, stats]) => ({ companyTag, ...stats, completionRate: stats.total > 0 ? Math.round((stats.solved / stats.total) * 100) : 0 }))
          .sort((a, b) => b.total - a.total);
      };
    }

    if (shouldInclude("heatmap")) {
      tasks.heatmap = async () => {
        const year = new Date().getFullYear();
        const startDate = new Date(`${year}-01-01T00:00:00.000+05:30`);
        const endDate = new Date(`${year + 1}-01-01T00:00:00.000+05:30`);
        const solved = await Question.aggregate([
          { $match: { userId, status: QuestionStatus.Solved, solvedAt: { $gte: startDate, $lt: endDate } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt" } }, count: { $sum: 1 } } },
        ]);
        const solvedMap = new Map(solved.map((s) => [s._id, s.count]));
        const heatmap: Record<string, number> = {};
        const current = new Date(startDate);
        while (current < endDate) {
          const dateStr = toISTDateString(current);
          heatmap[dateStr] = solvedMap.get(dateStr) || 0;
          current.setDate(current.getDate() + 1);
        }
        return heatmap;
      };
    }

    if (shouldInclude("difficultyByCategory")) {
      tasks.difficultyByCategory = async () => {
        const pipeline = await Question.aggregate([
          { $match: { userId, category: { $ne: null }, difficulty: { $ne: null } } },
          { $group: { _id: { category: "$category", difficulty: "$difficulty" }, count: { $sum: 1 } } },
        ]);
        const categories: Record<string, { easy: number; medium: number; hard: number }> = {};
        for (const c of Object.values(PrepCategory)) categories[c] = { easy: 0, medium: 0, hard: 0 };
        for (const row of pipeline) {
          const cat = row._id.category;
          if (!categories[cat]) continue;
          if (row._id.difficulty === Difficulty.Easy) categories[cat].easy += row.count;
          else if (row._id.difficulty === Difficulty.Medium) categories[cat].medium += row.count;
          else if (row._id.difficulty === Difficulty.Hard) categories[cat].hard += row.count;
        }
        return Object.entries(categories).map(([category, counts]) => ({
          category, ...counts, total: counts.easy + counts.medium + counts.hard,
        }));
      };
    }

    if (shouldInclude("streaks")) {
      tasks.streaks = async () => {
        const solved = await Question.aggregate([
          { $match: { userId, status: QuestionStatus.Solved, solvedAt: { $ne: null } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt" } } } },
          { $sort: { _id: 1 } },
        ]);
        if (solved.length === 0) return { currentStreak: 0, longestStreak: 0, totalActiveDays: 0 };
        const dates = solved.map((s) => s._id as string);
        let longestStreak = 1, currentRun = 1;
        for (let i = 1; i < dates.length; i++) {
          const diff = (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000;
          if (diff === 1) currentRun++;
          else currentRun = 1;
          if (currentRun > longestStreak) longestStreak = currentRun;
        }
        const today = toISTMidnight(new Date());
        let currentStreak = 0;
        const dateSet = new Set(dates);
        const latestDate = new Date(`${dates[dates.length - 1]}T00:00:00.000+05:30`);
        const daysSinceLatest = Math.round((today.getTime() - latestDate.getTime()) / 86400000);
        if (daysSinceLatest <= 1) {
          const checkDate = new Date(latestDate);
          while (dateSet.has(toISTDateString(checkDate))) { currentStreak++; checkDate.setDate(checkDate.getDate() - 1); }
        }
        return { currentStreak, longestStreak, totalActiveDays: dates.length };
      };
    }

    if (shouldInclude("insights")) {
      tasks.insights = async () => {
        const cacheKey = `stats:${userId}:insights`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;
        const result = await fetchInsightsData(userId!);
        cache.set(cacheKey, result);
        return result;
      };
    }

    // Execute all tasks in parallel
    const keys = Object.keys(tasks);
    const values = await Promise.all(keys.map((k) => tasks[k]()));
    const result: Record<string, any> = {};
    keys.forEach((k, i) => { result[k] = values[i]; });

    sendSuccess(res, result);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching batch stats");
  }
};

// ---- Insights ----

interface DimensionEntry {
  total: number;
  solved: number;
  pending: number;
  lastSolved: Date | null;
}

interface WeakAreaItem {
  type: "category" | "topic" | "difficulty";
  name: string;
  total: number;
  solved: number;
  completionRate: number;
  lastSolvedDaysAgo: number | null;
}

interface Tip {
  text: string;
  priority: "high" | "medium" | "low";
}

interface Milestone {
  name: string;
  achieved: boolean;
  progress: string;
}

/**
 * Fetches all insights data in a single $facet aggregation (1 DB round trip).
 */
const fetchInsightsData = async (userId: string) => {
  const now = new Date();
  const sixtyDaysAgo = toISTMidnight(new Date());
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const dimGroup = (dimKey: string) => ({
    $group: {
      _id: { [dimKey]: `$${dimKey}`, status: "$status" },
      count: { $sum: 1 },
      lastSolved: { $max: { $cond: [{ $eq: ["$status", QuestionStatus.Solved] }, "$solvedAt", null] } },
    },
  });

  const [facetResult] = await Question.aggregate([
    { $match: { userId } },
    {
      $facet: {
        catRows: [{ $match: { category: { $ne: null } } }, dimGroup("category")],
        topicRows: [{ $match: { topic: { $nin: [null, ""] } } }, dimGroup("topic")],
        diffRows: [{ $match: { difficulty: { $ne: null } } }, dimGroup("difficulty")],
        dailyRows: [
          { $match: { status: QuestionStatus.Solved, solvedAt: { $gte: sixtyDaysAgo } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt" } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        backlogCount: [{ $match: { category: null } }, { $count: "count" }],
        totalSolved: [{ $match: { status: QuestionStatus.Solved } }, { $count: "count" }],
      },
    },
  ]);

  const categoryMap = reduceByDimension(facetResult.catRows, "category", Object.values(PrepCategory));
  const topicMap = reduceByDimension(facetResult.topicRows, "topic");
  const difficultyMap = reduceByDimension(facetResult.diffRows, "difficulty", Object.values(Difficulty));
  const dailySolvesMap = new Map<string, number>(facetResult.dailyRows.map((r: any) => [r._id, r.count]));
  const backlogCount = facetResult.backlogCount[0]?.count ?? 0;
  const totalSolved = facetResult.totalSolved[0]?.count ?? 0;

  return {
    weakAreas: buildWeakAreas(categoryMap, topicMap, difficultyMap, now),
    tips: buildTips(categoryMap, topicMap, difficultyMap, dailySolvesMap, backlogCount, now),
    milestones: buildMilestones(categoryMap, difficultyMap, dailySolvesMap, totalSolved),
  };
};

function reduceByDimension(rows: any[], dimKey: string, initKeys?: string[]): Map<string, DimensionEntry> {
  const map = new Map<string, DimensionEntry>();
  if (initKeys) {
    for (const key of initKeys) map.set(key, { total: 0, solved: 0, pending: 0, lastSolved: null });
  }
  for (const row of rows) {
    const name = row._id[dimKey] as string;
    if (!map.has(name)) map.set(name, { total: 0, solved: 0, pending: 0, lastSolved: null });
    const entry = map.get(name)!;
    entry.total += row.count;
    if (row._id.status === QuestionStatus.Solved) {
      entry.solved += row.count;
      if (row.lastSolved && (!entry.lastSolved || row.lastSolved > entry.lastSolved)) {
        entry.lastSolved = row.lastSolved;
      }
    } else {
      entry.pending += row.count;
    }
  }
  return map;
}

function buildWeakAreas(
  categoryMap: Map<string, DimensionEntry>,
  topicMap: Map<string, DimensionEntry>,
  difficultyMap: Map<string, DimensionEntry>,
  now: Date
): WeakAreaItem[] {
  const items: WeakAreaItem[] = [];
  const daysAgo = (d: Date | null) => (d ? Math.floor((now.getTime() - d.getTime()) / 86400000) : null);

  for (const [name, e] of categoryMap) {
    if (e.total < 2) continue;
    const rate = Math.round((e.solved / e.total) * 100);
    const lastDays = daysAgo(e.lastSolved);
    if (rate < 50 || (lastDays !== null && lastDays > 14 && e.pending > 0)) {
      items.push({
        type: "category",
        name,
        total: e.total,
        solved: e.solved,
        completionRate: rate,
        lastSolvedDaysAgo: lastDays,
      });
    }
  }
  for (const [name, e] of topicMap) {
    if (e.total < 3) continue;
    const rate = Math.round((e.solved / e.total) * 100);
    if (rate < 50) {
      items.push({
        type: "topic",
        name,
        total: e.total,
        solved: e.solved,
        completionRate: rate,
        lastSolvedDaysAgo: daysAgo(e.lastSolved),
      });
    }
  }
  for (const [name, e] of difficultyMap) {
    if (e.total === 0) continue;
    const rate = Math.round((e.solved / e.total) * 100);
    if (rate < 30) {
      items.push({
        type: "difficulty",
        name,
        total: e.total,
        solved: e.solved,
        completionRate: rate,
        lastSolvedDaysAgo: daysAgo(e.lastSolved),
      });
    }
  }

  return items.sort((a, b) => a.completionRate - b.completionRate).slice(0, 5);
}

function buildTips(
  categoryMap: Map<string, DimensionEntry>,
  topicMap: Map<string, DimensionEntry>,
  difficultyMap: Map<string, DimensionEntry>,
  dailySolvesMap: Map<string, number>,
  backlogCount: number,
  now: Date
): Tip[] {
  const tips: Tip[] = [];
  const daysAgo = (d: Date | null) => (d ? Math.floor((now.getTime() - d.getTime()) / 86400000) : null);
  const priorityOrder = { high: 0, medium: 1, low: 2 };

  // Rusty categories — haven't practiced in a while
  for (const [name, e] of categoryMap) {
    if (e.total === 0) continue;
    const d = daysAgo(e.lastSolved);
    if (d !== null && d > 14)
      tips.push({ text: `${name} is getting rusty — last practiced ${d} days ago. Time for a refresher!`, priority: "high" });
    else if (d !== null && d > 7)
      tips.push({ text: `It's been ${d} days since you solved a ${name} question. Keep the streak alive!`, priority: "medium" });
  }
  for (const [name, e] of topicMap) {
    const d = daysAgo(e.lastSolved);
    if (d !== null && d > 14)
      tips.push({ text: `${name} is getting rusty — last practiced ${d} days ago`, priority: "high" });
  }

  // Difficulty balance
  const totalSolvedAll = [...difficultyMap.values()].reduce((s, e) => s + e.solved, 0);
  const hardSolved = difficultyMap.get(Difficulty.Hard)?.solved ?? 0;
  if (totalSolvedAll > 0 && hardSolved / totalSolvedAll < 0.15) {
    if (hardSolved === 0)
      tips.push({ text: `No Hard problems solved yet — try one to level up your problem-solving skills`, priority: "medium" });
    else
      tips.push({ text: `Only ${hardSolved} of your ${totalSolvedAll} solves are Hard — mix in a few more to build confidence`, priority: "medium" });
  }

  // Weakest category
  let weakest: { name: string; rate: number; pending: number } | null = null;
  for (const [name, e] of categoryMap) {
    if (e.total === 0) continue;
    const rate = Math.round((e.solved / e.total) * 100);
    if (rate < 50 && (!weakest || rate < weakest.rate)) weakest = { name, rate, pending: e.pending };
  }
  if (weakest)
    tips.push({ text: `${weakest.name} needs attention — ${weakest.pending} unsolved question${weakest.pending === 1 ? "" : "s"} remaining`, priority: "medium" });

  // Backlog reminder
  if (backlogCount > 10)
    tips.push({ text: `${backlogCount} questions waiting in your backlog — pick one and knock it out!`, priority: "low" });

  // Weekly momentum
  let weekSolved = 0;
  const checkDate = new Date(now);
  for (let i = 0; i < 7; i++) {
    weekSolved += dailySolvesMap.get(toISTDateString(checkDate)) || 0;
    checkDate.setDate(checkDate.getDate() - 1);
  }
  if (weekSolved >= 5)
    tips.push({ text: `${weekSolved} questions solved this week — you're on fire! Keep it going`, priority: "low" });

  // Close to mastering
  for (const [name, e] of categoryMap) {
    if (e.total === 0 || e.pending === 0) continue;
    const rate = Math.round((e.solved / e.total) * 100);
    if (rate > 80)
      tips.push({ text: `Almost there with ${name} — just ${e.pending} more to master it`, priority: "low" });
  }

  return tips.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]).slice(0, 5);
}

function buildMilestones(
  categoryMap: Map<string, DimensionEntry>,
  difficultyMap: Map<string, DimensionEntry>,
  dailySolvesMap: Map<string, number>,
  totalSolved: number
): Milestone[] {
  const milestones: Milestone[] = [];
  const m = (name: string, achieved: boolean, progress: string) => milestones.push({ name, achieved, progress });

  m("First Question", totalSolved >= 1, `${Math.min(totalSolved, 1)}/1`);
  m("Getting Started", totalSolved >= 10, `${Math.min(totalSolved, 10)}/10`);
  m("Half Century", totalSolved >= 50, `${Math.min(totalSolved, 50)}/50`);
  m("Century", totalSolved >= 100, `${Math.min(totalSolved, 100)}/100`);

  const hardSolved = difficultyMap.get(Difficulty.Hard)?.solved ?? 0;
  m("First Hard", hardSolved >= 1, `${Math.min(hardSolved, 1)}/1`);
  m("Hard Grinder", hardSolved >= 10, `${Math.min(hardSolved, 10)}/10`);

  const catsWithSolves = [...categoryMap.entries()].filter(([_, v]) => v.solved > 0).length;
  const catsWithQuestions = [...categoryMap.entries()].filter(([_, v]) => v.total > 0).length;
  m("Category Explorer", catsWithSolves >= 3, `${Math.min(catsWithSolves, 3)}/3`);
  m(
    "Well Rounded",
    catsWithQuestions > 0 && catsWithSolves >= catsWithQuestions,
    `${catsWithSolves}/${catsWithQuestions}`
  );

  // Streak detection — walk backward from today
  let currentStreak = 0;
  let maxStreak = 0;
  const checkDate = new Date();
  for (let i = 0; i < 60; i++) {
    const dateStr = toISTDateString(checkDate);
    if (dailySolvesMap.has(dateStr) && dailySolvesMap.get(dateStr)! > 0) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
    checkDate.setDate(checkDate.getDate() - 1);
  }
  m("Streak: 7 Days", maxStreak >= 7, `${Math.min(maxStreak, 7)}/7`);
  m("Streak: 30 Days", maxStreak >= 30, `${Math.min(maxStreak, 30)}/30`);

  return milestones;
}

/**
 * GET /api/stats/insights
 * Returns personalized insights: weak areas, tips, and milestones.
 * Cached for 5 minutes per user, invalidated on question mutations.
 */
export const getInsights = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const cacheKey = `stats:${userId}:insights`;

    if (req.query.refresh !== "true") {
      const cached = cache.get(cacheKey);
      if (cached) {
        sendSuccess(res, cached);
        return;
      }
    }

    const result = await fetchInsightsData(userId!);
    cache.set(cacheKey, result);
    sendSuccess(res, result);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching insights");
  }
};
