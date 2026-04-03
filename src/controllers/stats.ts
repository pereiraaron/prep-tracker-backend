import { Response } from "express";
import { Question } from "../models/Question";
import { AuthRequest } from "../types/auth";
import { PrepCategory, CATEGORY_LABEL } from "../types/category";
import { QuestionStatus, Difficulty, QuestionSource } from "../types/question";
import { DEFAULT_TIMEZONE, toDateString, toMidnight } from "../utils/date";
import { sendSuccess, sendError } from "../utils/response";
import { logger } from "../utils/logger";
import { cache } from "../utils/cache";

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
      const cached = cache.get(cacheKey);
      if (cached) { sendSuccess(res, cached); return; }
    }
    const data = await compute();
    cache.set(cacheKey, data);
    sendSuccess(res, data);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, errorMsg);
  }
};

const cachedCompute = async (cacheKey: string, compute: () => Promise<any>) => {
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const data = await compute();
  cache.set(cacheKey, data);
  return data;
};

// ---- Compute functions (shared between individual endpoints and batch) ----

async function computeOverview(userId: string) {
  const [facetResult] = await Question.aggregate([
    { $match: { userId } },
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
    { $match: { userId, category: { $ne: null } } },
    { $group: { _id: { category: "$category", status: "$status" }, count: { $sum: 1 } } },
  ]);
  return computeStatusBreakdown(pipeline, Object.values(PrepCategory), "category");
}

async function computeDifficultyBreakdown(userId: string) {
  const pipeline = await Question.aggregate([
    { $match: { userId, difficulty: { $ne: null } } },
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
    { $unwind: "$topics" },
    { $group: { _id: "$topics", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 30 },
    { $project: { _id: 0, topic: "$_id", count: 1 } },
  ]);
}

async function computeSourceBreakdown(userId: string) {
  const pipeline = await Question.aggregate([
    { $match: { userId, source: { $nin: [null, ""] } } },
    { $group: { _id: { source: "$source", status: "$status" }, count: { $sum: 1 } } },
  ]);
  return computeStatusBreakdown(pipeline, Object.values(QuestionSource), "source");
}

async function computeCompanyTagBreakdown(userId: string) {
  return Question.aggregate([
    { $match: { userId, companyTags: { $exists: true, $ne: [] }, status: QuestionStatus.Solved } },
    { $unwind: "$companyTags" },
    { $group: { _id: "$companyTags", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 30 },
    { $project: { _id: 0, companyTag: "$_id", count: 1 } },
  ]);
}

async function computeTagBreakdown(userId: string) {
  return Question.aggregate([
    { $match: { userId, tags: { $exists: true, $ne: [] }, status: QuestionStatus.Solved } },
    { $unwind: "$tags" },
    { $group: { _id: "$tags", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 30 },
    { $project: { _id: 0, tag: "$_id", count: 1 } },
  ]);
}

async function computeProgress(userId: string, days: number, tz: string) {
  const now = new Date();
  now.setDate(now.getDate() - days);
  const startDate = toMidnight(now, tz);

  const solved = await Question.aggregate([
    { $match: { userId, status: QuestionStatus.Solved, solvedAt: { $gte: startDate } } },
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
    { $match: { userId, status: QuestionStatus.Solved, solvedAt: { $ne: null } } },
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
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$solvedAt", timezone: tz } }, count: { $sum: 1 } } },
  ]);

  const heatmap: Record<string, number> = {};
  for (const s of solved) heatmap[s._id] = s.count;
  return heatmap;
}

async function computeWeeklyProgress(userId: string, weeks: number, tz: string) {
  const now = new Date();
  const startDate = toMidnight(now, tz);
  startDate.setDate(startDate.getDate() - weeks * 7);

  const solved = await Question.aggregate([
    { $match: { userId, status: QuestionStatus.Solved, solvedAt: { $gte: startDate } } },
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

async function computeCumulativeProgress(userId: string, days: number, tz: string) {
  const now = new Date();
  now.setDate(now.getDate() - days);
  const startDate = toMidnight(now, tz);

  const [facetResult] = await Question.aggregate([
    { $match: { userId, status: QuestionStatus.Solved, solvedAt: { $ne: null } } },
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
    { $match: { userId, category: { $ne: null }, difficulty: { $ne: null }, status: QuestionStatus.Solved } },
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

interface WeakAreaItem {
  type: "category" | "topic" | "difficulty";
  name: string;
  count: number;
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
    { $match: { userId } },
    {
      $facet: {
        catRows: [
          { $match: { category: { $ne: null }, status: QuestionStatus.Solved } },
          solvedDimGroup("category"),
        ],
        topicRows: [
          { $match: { topics: { $exists: true, $ne: [] }, status: QuestionStatus.Solved } },
          { $unwind: "$topics" },
          solvedDimGroup("topics"),
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
  const topicMap = reduceByDimension(facetResult.topicRows);
  const difficultyMap = reduceByDimension(facetResult.diffRows, Object.values(Difficulty));
  const dailySolvesMap = new Map<string, number>(facetResult.dailyRows.map((r: any) => [r._id, r.count]));
  const backlogCount = facetResult.backlogCount[0]?.count ?? 0;
  const backlogOldestDate: Date | null = facetResult.backlogOldest[0]?.createdAt ?? null;
  const totalSolved = facetResult.totalSolved[0]?.count ?? 0;
  const backlogCleared = facetResult.backlogCleared[0]?.count ?? 0;
  const backlogAdded = facetResult.backlogAdded[0]?.count ?? 0;

  return {
    weakAreas: buildWeakAreas(categoryMap, topicMap, difficultyMap, now),
    tips: buildTips(categoryMap, topicMap, difficultyMap, dailySolvesMap, backlogCount, backlogOldestDate, backlogCleared, backlogAdded, now, tz),
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

function buildWeakAreas(
  categoryMap: Map<string, DimensionEntry>,
  _topicMap: Map<string, DimensionEntry>,
  difficultyMap: Map<string, DimensionEntry>,
  now: Date
): WeakAreaItem[] {
  const items: WeakAreaItem[] = [];
  const daysAgo = (d: Date | null) => (d ? Math.floor((now.getTime() - d.getTime()) / 86400000) : null);
  const totalSolved = [...categoryMap.values()].reduce((s, e) => s + e.count, 0);
  if (totalSolved === 0) return [];

  const catEntries = [...categoryMap.entries()];
  const avgCatCount = totalSolved / catEntries.length;
  for (const [name, e] of catEntries) {
    const lastDays = daysAgo(e.lastSolved);
    if (e.count === 0 || (lastDays !== null && lastDays > 7) || e.count < avgCatCount * 0.5) {
      items.push({
        type: "category",
        name: CATEGORY_LABEL[name] || name,
        count: e.count,
        lastSolvedDaysAgo: lastDays,
      });
    }
  }

  for (const [name, e] of difficultyMap) {
    const ratio = totalSolved > 0 ? e.count / totalSolved : 0;
    if (ratio < 0.2) {
      items.push({
        type: "difficulty",
        name,
        count: e.count,
        lastSolvedDaysAgo: daysAgo(e.lastSolved),
      });
    }
  }

  return items.sort((a, b) => a.count - b.count).slice(0, 5);
}

function buildTips(
  categoryMap: Map<string, DimensionEntry>,
  _topicMap: Map<string, DimensionEntry>,
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

export const getProgress = (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const days = parseInt(req.query.days as string) || 30;
  const tz = getTz(req);
  return handleStat(req, res, `stats:${userId}:progress:${days}`, () => computeProgress(userId, days, tz), "Error fetching progress stats");
};

export const getStreaks = (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const tz = getTz(req);
  return handleStat(req, res, `stats:${userId}:streaks`, () => computeStreaks(userId, tz), "Error fetching streak stats");
};

export const getHeatmap = (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const tz = getTz(req);
  const parsedYear = parseInt(req.query.year as string);
  const year = parsedYear >= 2000 && parsedYear <= 2100 ? parsedYear : new Date().getFullYear();
  return handleStat(req, res, `stats:${userId}:heatmap:${year}`, () => computeHeatmap(userId, year, tz), "Error fetching heatmap stats");
};

export const getWeeklyProgress = (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const weeks = parseInt(req.query.weeks as string) || 12;
  const tz = getTz(req);
  return handleStat(req, res, `stats:${userId}:weeklyProgress:${weeks}`, () => computeWeeklyProgress(userId, weeks, tz), "Error fetching weekly progress");
};

export const getCumulativeProgress = (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const days = parseInt(req.query.days as string) || 90;
  const tz = getTz(req);
  return handleStat(req, res, `stats:${userId}:cumulativeProgress:${days}`, () => computeCumulativeProgress(userId, days, tz), "Error fetching cumulative progress");
};

export const getDifficultyByCategory = (req: AuthRequest, res: Response) =>
  handleStat(req, res, `stats:${req.user!.id}:difficultyByCategory`, () => computeDifficultyByCategory(req.user!.id), "Error fetching difficulty by category");

export const getInsights = (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const tz = getTz(req);
  return handleStat(req, res, `stats:${userId}:insights`, () => computeInsights(userId, tz), "Error fetching insights");
};

// ---- Batch ----

export const getBatch = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const tz = getTz(req);
    const requestedKeys = req.query.keys
      ? (req.query.keys as string).split(",").map((k) => k.trim()).sort()
      : null;

    const batchCacheKey = `stats:${userId}:batch:${requestedKeys?.join(",") || "all"}`;
    if (req.query.refresh !== "true") {
      const cached = cache.get(batchCacheKey);
      if (cached) { sendSuccess(res, cached); return; }
    }

    const shouldInclude = (key: string) => !requestedKeys || requestedKeys.includes(key);
    const tasks: Record<string, () => Promise<any>> = {};

    if (shouldInclude("overview"))
      tasks.overview = () => cachedCompute(`stats:${userId}:overview`, () => computeOverview(userId));
    if (shouldInclude("categories"))
      tasks.categories = () => cachedCompute(`stats:${userId}:categories`, () => computeCategoryBreakdown(userId));
    if (shouldInclude("difficulties"))
      tasks.difficulties = () => cachedCompute(`stats:${userId}:difficulties`, () => computeDifficultyBreakdown(userId));
    if (shouldInclude("topics"))
      tasks.topics = () => cachedCompute(`stats:${userId}:topics:all`, () => computeTopicBreakdown(userId));
    if (shouldInclude("sources"))
      tasks.sources = () => cachedCompute(`stats:${userId}:sources`, () => computeSourceBreakdown(userId));
    if (shouldInclude("companyTags"))
      tasks.companyTags = () => cachedCompute(`stats:${userId}:companyTags`, () => computeCompanyTagBreakdown(userId));
    if (shouldInclude("tags"))
      tasks.tags = () => cachedCompute(`stats:${userId}:tags`, () => computeTagBreakdown(userId));
    if (shouldInclude("progress"))
      tasks.progress = () => cachedCompute(`stats:${userId}:progress:14`, () => computeProgress(userId, 14, tz));
    if (shouldInclude("weeklyProgress"))
      tasks.weeklyProgress = () => cachedCompute(`stats:${userId}:weeklyProgress:12`, () => computeWeeklyProgress(userId, 12, tz));
    if (shouldInclude("cumulativeProgress"))
      tasks.cumulativeProgress = () => cachedCompute(`stats:${userId}:cumulativeProgress:90`, () => computeCumulativeProgress(userId, 90, tz));
    if (shouldInclude("heatmap")) {
      const year = new Date().getFullYear();
      tasks.heatmap = () => cachedCompute(`stats:${userId}:heatmap:${year}`, () => computeHeatmap(userId, year, tz));
    }
    if (shouldInclude("difficultyByCategory"))
      tasks.difficultyByCategory = () => cachedCompute(`stats:${userId}:difficultyByCategory`, () => computeDifficultyByCategory(userId));
    if (shouldInclude("streaks"))
      tasks.streaks = () => cachedCompute(`stats:${userId}:streaks`, () => computeStreaks(userId, tz));
    if (shouldInclude("insights"))
      tasks.insights = () => cachedCompute(`stats:${userId}:insights`, () => computeInsights(userId, tz));

    const keys = Object.keys(tasks);
    const values = await Promise.all(keys.map((k) => tasks[k]()));
    const result: Record<string, any> = {};
    keys.forEach((k, i) => { result[k] = values[i]; });

    cache.set(batchCacheKey, result);
    sendSuccess(res, result);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching batch stats");
  }
};
