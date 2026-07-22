import { Response } from "express";
import { Question } from "../models/Question";
import { AuthRequest } from "../types/auth";
import { PrepCategory, CATEGORY_LABEL } from "../types/category";
import { QuestionStatus, Difficulty, QuestionSource } from "../types/question";
import { DEFAULT_TIMEZONE, toDateString, toMidnight } from "../utils/date";
import { sendSuccess, sendError } from "../utils/response";
import { logger } from "../utils/logger";
import { cache } from "../utils/cache";
import { STATS_PROJECT, STATS_CACHE_TTL_MS, userStatsStages } from "../utils/aggregation";
import {
  computeApplicationStats,
  computeInterviewStats,
} from "./interviewStats";

// ---- Helpers ----

const getTz = (req: AuthRequest) => req.user?.timezone || DEFAULT_TIMEZONE;

const handleStat = async (
  req: AuthRequest,
  res: Response,
  cacheKey: string,
  compute: () => Promise<any>,
  errorMsg: string
) => {
  try {
    if (req.query.refresh !== "true") {
      const cached = await cache.get(cacheKey);
      if (cached) { sendSuccess(res, cached); return; }
    }
    const data = await compute();
    await cache.set(cacheKey, data, STATS_CACHE_TTL_MS);
    sendSuccess(res, data);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, errorMsg);
  }
};

// ---- Compute functions (shared between individual endpoints and batch) ----

async function computeOverview(userId: string) {
  const [facetResult] = await Question.aggregate([
    ...userStatsStages(userId),
    {
      $facet: {
        byCategory: [
          { $match: { category: { $ne: null }, status: QuestionStatus.Solved } },
          { $group: { _id: "$category", count: { $sum: 1 } } },
        ],
        byDifficulty: [
          { $match: { difficulty: { $ne: null }, status: QuestionStatus.Solved } },
          { $group: { _id: "$difficulty", count: { $sum: 1 } } },
        ],
        totalSolved: [{ $match: { status: QuestionStatus.Solved } }, { $count: "count" }],
        backlog: [{ $match: { status: QuestionStatus.Pending } }, { $count: "count" }],
      },
    },
  ]);

  const categoryMap: Record<string, number> = {};
  for (const c of Object.values(PrepCategory)) categoryMap[c] = 0;
  for (const row of facetResult.byCategory) categoryMap[row._id] = row.count;

  const difficultyMap: Record<string, number> = {};
  for (const d of Object.values(Difficulty)) difficultyMap[d] = 0;
  for (const row of facetResult.byDifficulty) difficultyMap[row._id] = row.count;

  return {
    totalSolved: facetResult.totalSolved[0]?.count ?? 0,
    backlogCount: facetResult.backlog[0]?.count ?? 0,
    byCategory: categoryMap,
    byDifficulty: difficultyMap,
  };
}

function computeStatusBreakdown<T extends string>(
  pipeline: any[],
  allValues: T[],
  keyName: string
) {
  const map: Record<string, { solved: number; pending: number }> = {};
  for (const v of allValues) map[v] = { solved: 0, pending: 0 };
  for (const row of pipeline) {
    const key = row._id[keyName];
    if (!map[key]) continue;
    if (row._id.status === QuestionStatus.Solved) map[key].solved = row.count;
    else if (row._id.status === QuestionStatus.Pending) map[key].pending = row.count;
  }
  return Object.entries(map).map(([name, counts]) => {
    const total = counts.solved + counts.pending;
    return {
      [keyName]: name,
      count: counts.solved,
      total,
      solved: counts.solved,
      pending: counts.pending,
      completionRate: total > 0 ? Math.round((counts.solved / total) * 100) : 0,
    };
  });
}

async function computeCategoryBreakdown(userId: string) {
  const pipeline = await Question.aggregate([
    ...userStatsStages(userId, { category: { $ne: null } }),
    { $group: { _id: { category: "$category", status: "$status" }, count: { $sum: 1 } } },
  ]);
  return computeStatusBreakdown(pipeline, Object.values(PrepCategory), "category");
}

async function computeDifficultyBreakdown(userId: string) {
  const pipeline = await Question.aggregate([
    ...userStatsStages(userId, { difficulty: { $ne: null } }),
    { $group: { _id: { difficulty: "$difficulty", status: "$status" }, count: { $sum: 1 } } },
  ]);
  return computeStatusBreakdown(pipeline, Object.values(Difficulty), "difficulty");
}

async function computeTopicBreakdown(userId: string, category?: string) {
  const matchFilter: Record<string, any> = {
    userId,
    topics: { $exists: true, $ne: [] },
    status: QuestionStatus.Solved,
  };
  if (category) matchFilter.category = category;

  return Question.aggregate([
    { $match: matchFilter },
    STATS_PROJECT,
    { $unwind: "$topics" },
    { $group: { _id: "$topics", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 30 },
    { $project: { _id: 0, topic: "$_id", count: 1 } },
  ]);
}

async function computeDailyByCategory(userId: string, days: number, tz: string, category?: string) {
  const now = new Date();
  now.setDate(now.getDate() - days);
  const startDate = toMidnight(now, tz);

  const match: Record<string, any> = { userId, status: QuestionStatus.Solved, solvedAt: { $gte: startDate }, category: { $ne: null } };
  if (category) match.category = category;

  const daily = await Question.aggregate([
    { $match: match },
    STATS_PROJECT,
    { $group: { _id: { date: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt", timezone: tz } }, category: "$category" }, count: { $sum: 1 } } },
    { $sort: { "_id.date": 1 } },
  ]);

  // Determine which categories appear
  const categorySet = new Set<string>();
  const dataMap = new Map<string, Record<string, number>>();
  for (const row of daily) {
    const { date, category: cat } = row._id;
    categorySet.add(cat);
    if (!dataMap.has(date)) dataMap.set(date, {});
    dataMap.get(date)![cat] = row.count;
  }
  const categories = Object.values(PrepCategory).filter((c) => categorySet.has(c));

  // Fill in all dates
  const result: Array<Record<string, any>> = [];
  const current = new Date(startDate);
  const todayStr = toDateString(new Date(), tz);
  let dateStr = toDateString(current, tz);
  while (dateStr <= todayStr) {
    const entry: Record<string, any> = { date: dateStr };
    const dayData = dataMap.get(dateStr) || {};
    for (const cat of categories) entry[cat] = dayData[cat] || 0;
    result.push(entry);
    current.setDate(current.getDate() + 1);
    dateStr = toDateString(current, tz);
  }

  return { categories, days: result };
}

async function computeSourceBreakdown(userId: string) {
  const pipeline = await Question.aggregate([
    ...userStatsStages(userId, { source: { $nin: [null, ""] } }),
    { $group: { _id: { source: "$source", status: "$status" }, count: { $sum: 1 } } },
  ]);
  return computeStatusBreakdown(pipeline, Object.values(QuestionSource), "source");
}

async function computeCompanyTagBreakdown(userId: string, category?: string) {
  const match: Record<string, any> = { userId, companyTags: { $exists: true, $ne: [] }, status: QuestionStatus.Solved };
  if (category) match.category = category;
  return Question.aggregate([
    { $match: match },
    STATS_PROJECT,
    { $unwind: "$companyTags" },
    { $group: { _id: "$companyTags", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 30 },
    { $project: { _id: 0, companyTag: "$_id", count: 1 } },
  ]);
}

async function computeTagBreakdown(userId: string) {
  return Question.aggregate([
    ...userStatsStages(userId, { tags: { $exists: true, $ne: [] }, status: QuestionStatus.Solved }),
    { $unwind: "$tags" },
    { $group: { _id: "$tags", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 30 },
    { $project: { _id: 0, tag: "$_id", count: 1 } },
  ]);
}

async function computeProgress(userId: string, days: number, tz: string, category?: string) {
  const now = new Date();
  now.setDate(now.getDate() - days);
  const startDate = toMidnight(now, tz);

  const match: Record<string, any> = { userId, status: QuestionStatus.Solved, solvedAt: { $gte: startDate } };
  if (category) match.category = category;

  const solved = await Question.aggregate([
    { $match: match },
    STATS_PROJECT,
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt", timezone: tz } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  const result: Array<{ date: string; solved: number }> = [];
  const solvedMap = new Map(solved.map((s) => [s._id, s.count]));
  const current = new Date(startDate);
  const todayStr = toDateString(new Date(), tz);

  let dateStr = toDateString(current, tz);
  while (dateStr <= todayStr) {
    result.push({ date: dateStr, solved: solvedMap.get(dateStr) || 0 });
    current.setDate(current.getDate() + 1);
    dateStr = toDateString(current, tz);
  }
  return result;
}

async function computeStreaks(userId: string, tz: string) {
  const solved = await Question.aggregate([
    ...userStatsStages(userId, { status: QuestionStatus.Solved, solvedAt: { $ne: null } }),
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt", timezone: tz } } } },
    { $sort: { _id: 1 } },
  ]);

  if (solved.length === 0) {
    return { currentStreak: 0, longestStreak: 0, totalActiveDays: 0 };
  }

  const dates = solved.map((s) => s._id as string);
  const totalActiveDays = dates.length;

  let longestStreak = 1;
  let currentRun = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const curr = new Date(dates[i]);
    const diffDays = (curr.getTime() - prev.getTime()) / 86400000;
    if (diffDays === 1) currentRun++;
    else currentRun = 1;
    if (currentRun > longestStreak) longestStreak = currentRun;
  }

  const today = toMidnight(new Date(), tz);
  let currentStreak = 0;
  const dateSet = new Set(dates);
  const latestDate = toMidnight(new Date(`${dates[dates.length - 1]}T12:00:00Z`), tz);
  const daysSinceLatest = Math.round((today.getTime() - latestDate.getTime()) / 86400000);

  if (daysSinceLatest <= 1) {
    const checkDate = new Date(latestDate);
    while (dateSet.has(toDateString(checkDate, tz))) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
  }

  return { currentStreak, longestStreak, totalActiveDays };
}

async function computeHeatmap(userId: string, year: number, tz: string) {
  const startDate = toMidnight(new Date(`${year}-01-01T12:00:00Z`), tz);
  const endDate = toMidnight(new Date(`${year + 1}-01-01T12:00:00Z`), tz);

  const solved = await Question.aggregate([
    { $match: { userId, status: QuestionStatus.Solved, solvedAt: { $gte: startDate, $lt: endDate } } },
    STATS_PROJECT,
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt", timezone: tz } }, count: { $sum: 1 } } },
  ]);

  const heatmap: Record<string, number> = {};
  for (const s of solved) heatmap[s._id] = s.count;
  return heatmap;
}

async function computeWeeklyProgress(userId: string, weeks: number, tz: string, category?: string) {
  const now = new Date();
  const startDate = toMidnight(now, tz);
  startDate.setDate(startDate.getDate() - weeks * 7);

  const match: Record<string, any> = { userId, status: QuestionStatus.Solved, solvedAt: { $gte: startDate } };
  if (category) match.category = category;

  const solved = await Question.aggregate([
    { $match: match },
    STATS_PROJECT,
    { $group: { _id: { $dateToString: { format: "%G-W%V", date: "$solvedAt", timezone: tz } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  const solvedMap = new Map(solved.map((s) => [s._id, s.count]));
  const result: Array<{ week: string; startDate: string; solved: number }> = [];

  const current = new Date(startDate);
  const day = current.getDay();
  current.setDate(current.getDate() - ((day + 6) % 7));

  const todayStr = toDateString(new Date(), tz);
  while (toDateString(current, tz) <= todayStr) {
    const weekStart = toDateString(current, tz);
    const temp = new Date(current);
    temp.setDate(temp.getDate() + 3 - ((temp.getDay() + 6) % 7));
    const yearStart = new Date(temp.getFullYear(), 0, 4);
    const weekNum = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
    const weekStr = `${temp.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;

    result.push({ week: weekStr, startDate: weekStart, solved: solvedMap.get(weekStr) || 0 });
    current.setDate(current.getDate() + 7);
  }
  return result;
}

async function computeCumulativeProgress(userId: string, days: number, tz: string, category?: string) {
  const now = new Date();
  now.setDate(now.getDate() - days);
  const startDate = toMidnight(now, tz);

  const match: Record<string, any> = { userId, status: QuestionStatus.Solved, solvedAt: { $ne: null } };
  if (category) match.category = category;

  const [facetResult] = await Question.aggregate([
    { $match: match },
    STATS_PROJECT,
    {
      $facet: {
        priorCount: [{ $match: { solvedAt: { $lt: startDate } } }, { $count: "count" }],
        daily: [
          { $match: { solvedAt: { $gte: startDate } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt", timezone: tz } }, count: { $sum: 1 } } },
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
  const todayStr = toDateString(new Date(), tz);

  let dateStr = toDateString(current, tz);
  while (dateStr <= todayStr) {
    runningTotal += dailyMap.get(dateStr) || 0;
    result.push({ date: dateStr, total: runningTotal });
    current.setDate(current.getDate() + 1);
    dateStr = toDateString(current, tz);
  }
  return result;
}

async function computeDifficultyByCategory(userId: string) {
  const pipeline = await Question.aggregate([
    ...userStatsStages(userId, { category: { $ne: null }, difficulty: { $ne: null }, status: QuestionStatus.Solved }),
    { $group: { _id: { category: "$category", difficulty: "$difficulty" }, count: { $sum: 1 } } },
  ]);

  const categories: Record<string, { easy: number; medium: number; hard: number }> = {};
  for (const c of Object.values(PrepCategory)) categories[c] = { easy: 0, medium: 0, hard: 0 };

  for (const row of pipeline) {
    const cat = row._id.category;
    const diff = row._id.difficulty as string;
    if (!categories[cat]) continue;
    if (diff === Difficulty.Easy) categories[cat].easy += row.count;
    else if (diff === Difficulty.Medium) categories[cat].medium += row.count;
    else if (diff === Difficulty.Hard) categories[cat].hard += row.count;
  }

  return Object.entries(categories).map(([category, counts]) => ({
    category,
    ...counts,
    total: counts.easy + counts.medium + counts.hard,
  }));
}

// ---- Insights ----

interface DimensionEntry {
  count: number;
  lastSolved: Date | null;
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

async function computeInsights(userId: string, tz: string) {
  const now = new Date();
  const sixtyDaysAgo = toMidnight(new Date(), tz);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const sevenDaysAgo = toMidnight(new Date(), tz);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const solvedDimGroup = (dimKey: string) => ({
    $group: {
      _id: `$${dimKey}`,
      count: { $sum: 1 },
      lastSolved: { $max: "$solvedAt" },
    },
  });

  const [facetResult] = await Question.aggregate([
    ...userStatsStages(userId),
    {
      $facet: {
        catRows: [
          { $match: { category: { $ne: null }, status: QuestionStatus.Solved } },
          solvedDimGroup("category"),
        ],
        diffRows: [
          { $match: { difficulty: { $ne: null }, status: QuestionStatus.Solved } },
          solvedDimGroup("difficulty"),
        ],
        dailyRows: [
          { $match: { status: QuestionStatus.Solved, solvedAt: { $gte: sixtyDaysAgo } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt", timezone: tz } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        backlogCount: [{ $match: { status: QuestionStatus.Pending } }, { $count: "count" }],
        backlogOldest: [
          { $match: { status: QuestionStatus.Pending } },
          { $sort: { createdAt: 1 } },
          { $limit: 1 },
          { $project: { createdAt: 1 } },
        ],
        totalSolved: [{ $match: { status: QuestionStatus.Solved } }, { $count: "count" }],
        // Backlog items cleared (pending → solved) in last 7 days:
        // solvedAt is >1 min after createdAt, meaning it was created as pending first
        backlogCleared: [
          {
            $match: {
              status: QuestionStatus.Solved,
              solvedAt: { $gte: sevenDaysAgo },
              $expr: { $gt: [{ $subtract: ["$solvedAt", "$createdAt"] }, 60000] },
            },
          },
          { $count: "count" },
        ],
        // New backlog items added in last 7 days
        backlogAdded: [
          { $match: { status: QuestionStatus.Pending, createdAt: { $gte: sevenDaysAgo } } },
          { $count: "count" },
        ],
      },
    },
  ]);

  const categoryMap = reduceByDimension(facetResult.catRows, Object.values(PrepCategory));
  const difficultyMap = reduceByDimension(facetResult.diffRows, Object.values(Difficulty));
  const dailySolvesMap = new Map<string, number>(facetResult.dailyRows.map((r: any) => [r._id, r.count]));
  const backlogCount = facetResult.backlogCount[0]?.count ?? 0;
  const backlogOldestDate: Date | null = facetResult.backlogOldest[0]?.createdAt ?? null;
  const totalSolved = facetResult.totalSolved[0]?.count ?? 0;
  const backlogCleared = facetResult.backlogCleared[0]?.count ?? 0;
  const backlogAdded = facetResult.backlogAdded[0]?.count ?? 0;

  return {
    tips: buildTips(categoryMap, difficultyMap, dailySolvesMap, backlogCount, backlogOldestDate, backlogCleared, backlogAdded, now, tz),
    milestones: buildMilestones(categoryMap, difficultyMap, dailySolvesMap, totalSolved, tz),
  };
}

function reduceByDimension(rows: any[], initKeys?: string[]): Map<string, DimensionEntry> {
  const map = new Map<string, DimensionEntry>();
  if (initKeys) {
    for (const key of initKeys) map.set(key, { count: 0, lastSolved: null });
  }
  for (const row of rows) {
    const name = row._id as string;
    if (!map.has(name)) map.set(name, { count: 0, lastSolved: null });
    const entry = map.get(name)!;
    entry.count += row.count;
    if (row.lastSolved && (!entry.lastSolved || row.lastSolved > entry.lastSolved)) {
      entry.lastSolved = row.lastSolved;
    }
  }
  return map;
}

function buildTips(
  categoryMap: Map<string, DimensionEntry>,
  difficultyMap: Map<string, DimensionEntry>,
  dailySolvesMap: Map<string, number>,
  backlogCount: number,
  backlogOldestDate: Date | null,
  backlogCleared: number,
  backlogAdded: number,
  now: Date,
  tz: string
): Tip[] {
  const tips: Tip[] = [];
  const daysAgo = (d: Date | null) => (d ? Math.floor((now.getTime() - d.getTime()) / 86400000) : null);
  const priorityOrder = { high: 0, medium: 1, low: 2 };

  for (const [name, e] of categoryMap) {
    if (e.count === 0) continue;
    const label = CATEGORY_LABEL[name] || name;
    const d = daysAgo(e.lastSolved);
    if (d !== null && d > 14)
      tips.push({ text: `${label} is getting rusty — last practiced ${d} days ago. Time for a refresher!`, priority: "high" });
    else if (d !== null && d > 7)
      tips.push({ text: `It's been ${d} days since you solved a ${label} question. Keep the streak alive!`, priority: "medium" });
  }

  const totalSolvedAll = [...categoryMap.values()].reduce((s, e) => s + e.count, 0);
  if (totalSolvedAll > 0) {
    let weakest: { label: string; count: number } | null = null;
    for (const [name, e] of categoryMap) {
      const label = CATEGORY_LABEL[name] || name;
      if (!weakest || e.count < weakest.count) weakest = { label, count: e.count };
    }
    if (weakest && weakest.count === 0)
      tips.push({ text: `${weakest.label} needs attention — no questions solved yet`, priority: "medium" });
  }

  const hardSolved = difficultyMap.get(Difficulty.Hard)?.count ?? 0;
  if (totalSolvedAll > 0 && hardSolved / totalSolvedAll < 0.15) {
    if (hardSolved === 0)
      tips.push({ text: `No Hard problems solved yet — try one to level up your problem-solving skills`, priority: "medium" });
    else
      tips.push({ text: `Only ${hardSolved} of your ${totalSolvedAll} solves are Hard — mix in a few more to build confidence`, priority: "medium" });
  }

  const mediumSolved = difficultyMap.get(Difficulty.Medium)?.count ?? 0;
  if (totalSolvedAll > 10 && mediumSolved / totalSolvedAll < 0.2) {
    tips.push({ text: `Medium problems are underrepresented — try adding more to balance your practice`, priority: "low" });
  }

  let weekSolved = 0;
  const checkDate = new Date(now);
  for (let i = 0; i < 7; i++) {
    weekSolved += dailySolvesMap.get(toDateString(checkDate, tz)) || 0;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  if (backlogCount > 0) {
    const oldestDays = backlogOldestDate ? Math.floor((now.getTime() - backlogOldestDate.getTime()) / 86400000) : 0;
    const netCleared = backlogCleared - backlogAdded;

    if (backlogCount >= 20) {
      if (backlogCleared > 0 && netCleared > 0)
        tips.push({ text: `You've cleared ${backlogCleared} backlog item${backlogCleared === 1 ? "" : "s"} this week — ${backlogCount} left, keep going!`, priority: "low" });
      else if (backlogCleared > 0)
        tips.push({ text: `${backlogCleared} backlog item${backlogCleared === 1 ? "" : "s"} cleared this week, but ${backlogAdded} new one${backlogAdded === 1 ? "" : "s"} added — try to stay ahead!`, priority: "medium" });
      else
        tips.push({ text: `You have ${backlogCount} items in your backlog — consider picking one to tackle today`, priority: "medium" });
    } else if (backlogCount >= 5) {
      if (backlogCleared > 0)
        tips.push({ text: `Down to ${backlogCount} in your backlog after clearing ${backlogCleared} this week — solid progress!`, priority: "low" });
      else
        tips.push({ text: `${backlogCount} questions in your backlog — a quick session could knock a few out`, priority: "low" });
    } else if (backlogCount > 0) {
      tips.push({ text: `Only ${backlogCount} item${backlogCount === 1 ? "" : "s"} left in your backlog — you're almost at zero!`, priority: "low" });
    }

    if (oldestDays > 30)
      tips.push({ text: `Your oldest backlog item has been waiting ${oldestDays} days — maybe it's time to revisit or remove it`, priority: "low" });
    else if (oldestDays > 14)
      tips.push({ text: `Some backlog items are over 2 weeks old — a good time to review what's still relevant`, priority: "low" });
  }

  if (weekSolved >= 5)
    tips.push({ text: `${weekSolved} questions solved this week — you're on fire! Keep it going`, priority: "low" });

  return tips.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]).slice(0, 5);
}

function buildMilestones(
  categoryMap: Map<string, DimensionEntry>,
  difficultyMap: Map<string, DimensionEntry>,
  dailySolvesMap: Map<string, number>,
  totalSolved: number,
  tz: string
): Milestone[] {
  const milestones: Milestone[] = [];
  const m = (name: string, achieved: boolean, progress: string) => milestones.push({ name, achieved, progress });

  m("First Question", totalSolved >= 1, `${Math.min(totalSolved, 1)}/1`);
  m("Getting Started", totalSolved >= 10, `${Math.min(totalSolved, 10)}/10`);
  m("Half Century", totalSolved >= 50, `${Math.min(totalSolved, 50)}/50`);
  m("Century", totalSolved >= 100, `${Math.min(totalSolved, 100)}/100`);

  const hardSolved = difficultyMap.get(Difficulty.Hard)?.count ?? 0;
  m("First Hard", hardSolved >= 1, `${Math.min(hardSolved, 1)}/1`);
  m("Hard Grinder", hardSolved >= 10, `${Math.min(hardSolved, 10)}/10`);

  const catsWithSolves = [...categoryMap.entries()].filter(([_, v]) => v.count > 0).length;
  const totalCats = categoryMap.size;
  m("Category Explorer", catsWithSolves >= 3, `${Math.min(catsWithSolves, 3)}/3`);
  m("Well Rounded", totalCats > 0 && catsWithSolves >= totalCats, `${catsWithSolves}/${totalCats}`);

  let currentStreak = 0;
  let maxStreak = 0;
  const checkDate = new Date();
  for (let i = 0; i < 60; i++) {
    const dateStr = toDateString(checkDate, tz);
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

// ---- Exported endpoint handlers ----

export const getOverview = (req: AuthRequest, res: Response) =>
  handleStat(req, res, `stats:${req.user!.id}:overview`, () => computeOverview(req.user!.id), "Error fetching overview stats");

export const getCategoryBreakdown = (req: AuthRequest, res: Response) =>
  handleStat(req, res, `stats:${req.user!.id}:categories`, () => computeCategoryBreakdown(req.user!.id), "Error fetching category breakdown");

export const getDifficultyBreakdown = (req: AuthRequest, res: Response) =>
  handleStat(req, res, `stats:${req.user!.id}:difficulties`, () => computeDifficultyBreakdown(req.user!.id), "Error fetching difficulty breakdown");

export const getTopicBreakdown = (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const catParam = req.query.category as string | undefined;
  return handleStat(req, res, `stats:${userId}:topics:${catParam || "all"}`, () => computeTopicBreakdown(userId, catParam), "Error fetching topic breakdown");
};

export const getSourceBreakdown = (req: AuthRequest, res: Response) =>
  handleStat(req, res, `stats:${req.user!.id}:sources`, () => computeSourceBreakdown(req.user!.id), "Error fetching source breakdown");

export const getCompanyTagBreakdown = (req: AuthRequest, res: Response) =>
  handleStat(req, res, `stats:${req.user!.id}:companyTags`, () => computeCompanyTagBreakdown(req.user!.id), "Error fetching company tag breakdown");

export const getTagBreakdown = (req: AuthRequest, res: Response) =>
  handleStat(req, res, `stats:${req.user!.id}:tags`, () => computeTagBreakdown(req.user!.id), "Error fetching tag breakdown");

export const getDailyByCategory = (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const days = parseInt(req.query.days as string) || 14;
  const tz = getTz(req);
  const category = req.query.category as string | undefined;
  const key = `stats:${userId}:dailyByCategory:${days}:${category || "all"}:${tz}`;
  return handleStat(req, res, key, () => computeDailyByCategory(userId, days, tz, category), "Error fetching daily by category");
};

export const getProgress = (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const days = parseInt(req.query.days as string) || 30;
  const tz = getTz(req);
  const category = req.query.category as string | undefined;
  const key = `stats:${userId}:progress:${days}:${category || "all"}:${tz}`;
  return handleStat(req, res, key, () => computeProgress(userId, days, tz, category), "Error fetching progress stats");
};

export const getStreaks = (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const tz = getTz(req);
  return handleStat(req, res, `stats:${userId}:streaks:${tz}`, () => computeStreaks(userId, tz), "Error fetching streak stats");
};

export const getHeatmap = (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const tz = getTz(req);
  const parsedYear = parseInt(req.query.year as string);
  const year = parsedYear >= 2000 && parsedYear <= 2100 ? parsedYear : new Date().getFullYear();
  return handleStat(req, res, `stats:${userId}:heatmap:${year}:${tz}`, () => computeHeatmap(userId, year, tz), "Error fetching heatmap stats");
};

export const getWeeklyProgress = (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const weeks = parseInt(req.query.weeks as string) || 12;
  const tz = getTz(req);
  const category = req.query.category as string | undefined;
  const key = `stats:${userId}:weeklyProgress:${weeks}:${category || "all"}:${tz}`;
  return handleStat(req, res, key, () => computeWeeklyProgress(userId, weeks, tz, category), "Error fetching weekly progress");
};

export const getCumulativeProgress = (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const days = parseInt(req.query.days as string) || 90;
  const tz = getTz(req);
  const category = req.query.category as string | undefined;
  const key = `stats:${userId}:cumulativeProgress:${days}:${category || "all"}:${tz}`;
  return handleStat(req, res, key, () => computeCumulativeProgress(userId, days, tz, category), "Error fetching cumulative progress");
};

export const getDifficultyByCategory = (req: AuthRequest, res: Response) =>
  handleStat(req, res, `stats:${req.user!.id}:difficultyByCategory`, () => computeDifficultyByCategory(req.user!.id), "Error fetching difficulty by category");

export const getInsights = (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const tz = getTz(req);
  return handleStat(req, res, `stats:${userId}:insights:${tz}`, () => computeInsights(userId, tz), "Error fetching insights");
};

// ---- Batch-optimized consolidated pipelines ----
// Combine multiple aggregations into single $facet calls to reduce DB round trips.
// Individual endpoint handlers above continue to use their own compute functions.

async function computeBatchBreakdowns(userId: string) {
  const [f] = await Question.aggregate([
    ...userStatsStages(userId),
    {
      $facet: {
        overviewByCat: [
          { $match: { category: { $ne: null }, status: QuestionStatus.Solved } },
          { $group: { _id: "$category", count: { $sum: 1 } } },
        ],
        overviewByDiff: [
          { $match: { difficulty: { $ne: null }, status: QuestionStatus.Solved } },
          { $group: { _id: "$difficulty", count: { $sum: 1 } } },
        ],
        totalSolved: [{ $match: { status: QuestionStatus.Solved } }, { $count: "count" }],
        backlogCount: [{ $match: { status: QuestionStatus.Pending } }, { $count: "count" }],
        catByStatus: [
          { $match: { category: { $ne: null } } },
          { $group: { _id: { category: "$category", status: "$status" }, count: { $sum: 1 } } },
        ],
        diffByStatus: [
          { $match: { difficulty: { $ne: null } } },
          { $group: { _id: { difficulty: "$difficulty", status: "$status" }, count: { $sum: 1 } } },
        ],
        srcByStatus: [
          { $match: { source: { $nin: [null, ""] } } },
          { $group: { _id: { source: "$source", status: "$status" }, count: { $sum: 1 } } },
        ],
        diffByCat: [
          { $match: { category: { $ne: null }, difficulty: { $ne: null }, status: QuestionStatus.Solved } },
          { $group: { _id: { category: "$category", difficulty: "$difficulty" }, count: { $sum: 1 } } },
        ],
      },
    },
  ]);

  const categoryMap: Record<string, number> = {};
  for (const c of Object.values(PrepCategory)) categoryMap[c] = 0;
  for (const row of f.overviewByCat) categoryMap[row._id] = row.count;
  const difficultyMap: Record<string, number> = {};
  for (const d of Object.values(Difficulty)) difficultyMap[d] = 0;
  for (const row of f.overviewByDiff) difficultyMap[row._id] = row.count;

  const overview = {
    totalSolved: f.totalSolved[0]?.count ?? 0,
    backlogCount: f.backlogCount[0]?.count ?? 0,
    byCategory: categoryMap,
    byDifficulty: difficultyMap,
  };

  const categories = computeStatusBreakdown(f.catByStatus, Object.values(PrepCategory), "category");
  const difficulties = computeStatusBreakdown(f.diffByStatus, Object.values(Difficulty), "difficulty");
  const sources = computeStatusBreakdown(f.srcByStatus, Object.values(QuestionSource), "source");

  const catDiffMap: Record<string, { easy: number; medium: number; hard: number }> = {};
  for (const c of Object.values(PrepCategory)) catDiffMap[c] = { easy: 0, medium: 0, hard: 0 };
  for (const row of f.diffByCat) {
    const cat = row._id.category;
    const diff = row._id.difficulty as string;
    if (!catDiffMap[cat]) continue;
    if (diff === Difficulty.Easy) catDiffMap[cat].easy += row.count;
    else if (diff === Difficulty.Medium) catDiffMap[cat].medium += row.count;
    else if (diff === Difficulty.Hard) catDiffMap[cat].hard += row.count;
  }
  const difficultyByCategory = Object.entries(catDiffMap).map(([category, counts]) => ({
    category,
    ...counts,
    total: counts.easy + counts.medium + counts.hard,
  }));

  return { overview, categories, difficulties, sources, difficultyByCategory };
}

async function computeBatchArrayFields(userId: string, category?: string) {
  const topicMatch: Record<string, any> = { topics: { $exists: true, $ne: [] } };
  if (category) topicMatch.category = category;
  const companyMatch: Record<string, any> = { companyTags: { $exists: true, $ne: [] } };
  if (category) companyMatch.category = category;

  const [f] = await Question.aggregate([
    ...userStatsStages(userId, { status: QuestionStatus.Solved }),
    {
      $facet: {
        topics: [
          { $match: topicMatch },
          { $unwind: "$topics" },
          { $group: { _id: "$topics", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 30 },
          { $project: { _id: 0, topic: "$_id", count: 1 } },
        ],
        companyTags: [
          { $match: companyMatch },
          { $unwind: "$companyTags" },
          { $group: { _id: "$companyTags", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 30 },
          { $project: { _id: 0, companyTag: "$_id", count: 1 } },
        ],
        tags: [
          { $match: { tags: { $exists: true, $ne: [] } } },
          { $unwind: "$tags" },
          { $group: { _id: "$tags", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 30 },
          { $project: { _id: 0, tag: "$_id", count: 1 } },
        ],
      },
    },
  ]);

  return { topics: f.topics, companyTags: f.companyTags, tags: f.tags };
}

async function computeBatchProgress(userId: string, tz: string, category?: string) {
  const now = new Date();
  const d14 = toMidnight(new Date(now.getTime() - 14 * 86400000), tz);
  const d84 = toMidnight(new Date(now.getTime() - 84 * 86400000), tz);
  const d90 = toMidnight(new Date(now.getTime() - 90 * 86400000), tz);
  const todayStr = toDateString(new Date(), tz);

  const match: Record<string, any> = { userId, status: QuestionStatus.Solved, solvedAt: { $ne: null } };
  if (category) match.category = category;

  const [f] = await Question.aggregate([
    { $match: match },
    STATS_PROJECT,
    {
      $facet: {
        daily: [
          { $match: { solvedAt: { $gte: d14 } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt", timezone: tz } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        weekly: [
          { $match: { solvedAt: { $gte: d84 } } },
          { $group: { _id: { $dateToString: { format: "%G-W%V", date: "$solvedAt", timezone: tz } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        cumulativePrior: [
          { $match: { solvedAt: { $lt: d90 } } },
          { $count: "count" },
        ],
        cumulativeDaily: [
          { $match: { solvedAt: { $gte: d90 } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt", timezone: tz } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  // Daily progress (14 days)
  const dailyMap = new Map<string, number>(f.daily.map((s: any) => [s._id, s.count]));
  const progress: Array<{ date: string; solved: number }> = [];
  const cur1 = new Date(d14);
  let ds1 = toDateString(cur1, tz);
  while (ds1 <= todayStr) {
    progress.push({ date: ds1, solved: dailyMap.get(ds1) || 0 });
    cur1.setDate(cur1.getDate() + 1);
    ds1 = toDateString(cur1, tz);
  }

  // Weekly progress (12 weeks)
  const weeklyMap = new Map<string, number>(f.weekly.map((s: any) => [s._id, s.count]));
  const weeklyProgress: Array<{ week: string; startDate: string; solved: number }> = [];
  const cur2 = new Date(d84);
  cur2.setDate(cur2.getDate() - ((cur2.getDay() + 6) % 7));
  while (toDateString(cur2, tz) <= todayStr) {
    const weekStart = toDateString(cur2, tz);
    const temp = new Date(cur2);
    temp.setDate(temp.getDate() + 3 - ((temp.getDay() + 6) % 7));
    const yearStart = new Date(temp.getFullYear(), 0, 4);
    const weekNum = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
    const weekStr = `${temp.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
    weeklyProgress.push({ week: weekStr, startDate: weekStart, solved: weeklyMap.get(weekStr) || 0 });
    cur2.setDate(cur2.getDate() + 7);
  }

  // Cumulative progress (90 days)
  const priorCount = f.cumulativePrior[0]?.count ?? 0;
  const cumDailyMap = new Map(f.cumulativeDaily.map((d: any) => [d._id, d.count]));
  const cumulativeProgress: Array<{ date: string; total: number }> = [];
  let runningTotal = priorCount;
  const cur3 = new Date(d90);
  let ds3 = toDateString(cur3, tz);
  while (ds3 <= todayStr) {
    runningTotal += cumDailyMap.get(ds3) || 0;
    cumulativeProgress.push({ date: ds3, total: runningTotal });
    cur3.setDate(cur3.getDate() + 1);
    ds3 = toDateString(cur3, tz);
  }

  return { progress, weeklyProgress, cumulativeProgress };
}

async function computeBatchActivity(userId: string, year: number, tz: string) {
  const yearStart = toMidnight(new Date(`${year}-01-01T12:00:00Z`), tz);
  const yearEnd = toMidnight(new Date(`${year + 1}-01-01T12:00:00Z`), tz);

  const [f] = await Question.aggregate([
    ...userStatsStages(userId, { status: QuestionStatus.Solved, solvedAt: { $ne: null } }),
    {
      $facet: {
        heatmapRows: [
          { $match: { solvedAt: { $gte: yearStart, $lt: yearEnd } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt", timezone: tz } }, count: { $sum: 1 } } },
        ],
        streakDates: [
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt", timezone: tz } } } },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  const heatmap: Record<string, number> = {};
  for (const s of f.heatmapRows) heatmap[s._id] = s.count;

  let streaks = { currentStreak: 0, longestStreak: 0, totalActiveDays: 0 };
  const dates = f.streakDates.map((s: any) => s._id as string);
  if (dates.length > 0) {
    const totalActiveDays = dates.length;
    let longestStreak = 1;
    let currentRun = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      if ((curr.getTime() - prev.getTime()) / 86400000 === 1) currentRun++;
      else currentRun = 1;
      if (currentRun > longestStreak) longestStreak = currentRun;
    }
    let currentStreak = 0;
    const today = toMidnight(new Date(), tz);
    const dateSet = new Set(dates);
    const latestDate = toMidnight(new Date(`${dates[dates.length - 1]}T12:00:00Z`), tz);
    const daysSinceLatest = Math.round((today.getTime() - latestDate.getTime()) / 86400000);
    if (daysSinceLatest <= 1) {
      const checkDate = new Date(latestDate);
      while (dateSet.has(toDateString(checkDate, tz))) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      }
    }
    streaks = { currentStreak, longestStreak, totalActiveDays };
  }

  return { heatmap, streaks };
}

// ---- Batch ----

export const getBatch = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const tz = getTz(req);
    const requestedKeys = req.query.keys
      ? (req.query.keys as string).split(",").map((k) => k.trim()).sort()
      : null;

    const category = req.query.category as string | undefined;
    const year = new Date().getFullYear();
    const batchCacheKey = `stats:${userId}:batch:${requestedKeys?.join(",") || "all"}:${category || "all"}:${tz}`;
    if (req.query.refresh !== "true") {
      const cached = await cache.get(batchCacheKey);
      if (cached) { sendSuccess(res, cached); return; }
    }
    const shouldInclude = (key: string) => !requestedKeys || requestedKeys.includes(key);

    // Consolidated groups — each runs one DB query instead of many
    const BREAKDOWN_KEYS = ["overview", "categories", "difficulties", "sources", "difficultyByCategory"];
    const ARRAY_KEYS = ["topics", "companyTags", "tags"];
    const PROGRESS_KEYS = ["progress", "weeklyProgress", "cumulativeProgress"];
    const ACTIVITY_KEYS = ["heatmap", "streaks"];

    const promises: Array<Promise<Record<string, any>>> = [];

    if (BREAKDOWN_KEYS.some(shouldInclude))
      promises.push(computeBatchBreakdowns(userId));
    if (ARRAY_KEYS.some(shouldInclude))
      promises.push(computeBatchArrayFields(userId, category));
    if (PROGRESS_KEYS.some(shouldInclude))
      promises.push(computeBatchProgress(userId, tz, category));
    if (ACTIVITY_KEYS.some(shouldInclude))
      promises.push(computeBatchActivity(userId, year, tz));
    if (shouldInclude("dailyByCategory"))
      promises.push(computeDailyByCategory(userId, 14, tz, category).then((d) => ({ dailyByCategory: d })));
    if (shouldInclude("insights"))
      promises.push(computeInsights(userId, tz).then((d) => ({ insights: d })));
    if (shouldInclude("applications"))
      promises.push(computeApplicationStats(userId).then((d) => ({ applications: d })));
    if (shouldInclude("interviews"))
      promises.push(computeInterviewStats(userId).then((d) => ({ interviews: d })));

    const groups = await Promise.all(promises);
    const result: Record<string, any> = {};
    for (const group of groups) {
      for (const [key, value] of Object.entries(group)) {
        if (shouldInclude(key)) result[key] = value;
      }
    }

    await cache.set(batchCacheKey, result, STATS_CACHE_TTL_MS);

    // Warm individual endpoint caches so /stats/overview etc. reuse this work
    const cat = category || "all";
    const warm: Array<Promise<void>> = [];
    if (result.overview) warm.push(cache.set(`stats:${userId}:overview`, result.overview, STATS_CACHE_TTL_MS));
    if (result.categories) warm.push(cache.set(`stats:${userId}:categories`, result.categories, STATS_CACHE_TTL_MS));
    if (result.difficulties) warm.push(cache.set(`stats:${userId}:difficulties`, result.difficulties, STATS_CACHE_TTL_MS));
    if (result.sources) warm.push(cache.set(`stats:${userId}:sources`, result.sources, STATS_CACHE_TTL_MS));
    if (result.difficultyByCategory) warm.push(cache.set(`stats:${userId}:difficultyByCategory`, result.difficultyByCategory, STATS_CACHE_TTL_MS));
    if (result.topics) warm.push(cache.set(`stats:${userId}:topics:${cat}`, result.topics, STATS_CACHE_TTL_MS));
    if (result.companyTags) warm.push(cache.set(`stats:${userId}:companyTags`, result.companyTags, STATS_CACHE_TTL_MS));
    if (result.tags) warm.push(cache.set(`stats:${userId}:tags`, result.tags, STATS_CACHE_TTL_MS));
    if (result.streaks) warm.push(cache.set(`stats:${userId}:streaks:${tz}`, result.streaks, STATS_CACHE_TTL_MS));
    if (result.insights) warm.push(cache.set(`stats:${userId}:insights:${tz}`, result.insights, STATS_CACHE_TTL_MS));
    if (result.heatmap) warm.push(cache.set(`stats:${userId}:heatmap:${year}:${tz}`, result.heatmap, STATS_CACHE_TTL_MS));
    if (result.progress) warm.push(cache.set(`stats:${userId}:progress:14:${cat}:${tz}`, result.progress, STATS_CACHE_TTL_MS));
    if (result.weeklyProgress) warm.push(cache.set(`stats:${userId}:weeklyProgress:12:${cat}:${tz}`, result.weeklyProgress, STATS_CACHE_TTL_MS));
    if (result.cumulativeProgress) warm.push(cache.set(`stats:${userId}:cumulativeProgress:90:${cat}:${tz}`, result.cumulativeProgress, STATS_CACHE_TTL_MS));
    if (result.dailyByCategory) warm.push(cache.set(`stats:${userId}:dailyByCategory:14:${cat}:${tz}`, result.dailyByCategory, STATS_CACHE_TTL_MS));
    if (result.applications) warm.push(cache.set(`stats:${userId}:applications`, result.applications, STATS_CACHE_TTL_MS));
    if (result.interviews) warm.push(cache.set(`stats:${userId}:interviews`, result.interviews, STATS_CACHE_TTL_MS));
    await Promise.all(warm);

    sendSuccess(res, result);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching batch stats");
  }
};
