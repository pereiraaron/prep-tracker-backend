import { Response } from "express";
import { Question } from "../models/Question";
import { DailyTask } from "../models/DailyTask";
import { AuthRequest } from "../types/auth";
import { PrepCategory } from "../types/category";
import { QuestionStatus, Difficulty } from "../types/question";
import { DailyTaskStatus } from "../types/dailyTask";
import { toISTDateString, toISTMidnight } from "../utils/recurrence";

/**
 * GET /api/stats/overview
 * Returns high-level counts: total questions, by status, by category, by difficulty.
 */
export const getOverview = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const activeFilter = { userId, dailyTask: { $ne: null } };

    const [byStatus, byCategory, byDifficulty, total, backlogCount] = await Promise.all([
      Question.aggregate([
        { $match: activeFilter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      DailyTask.aggregate([
        { $match: { userId } },
        {
          $lookup: {
            from: "questions",
            localField: "_id",
            foreignField: "dailyTask",
            as: "questions",
          },
        },
        { $unwind: "$questions" },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
      Question.aggregate([
        { $match: { ...activeFilter, difficulty: { $ne: null } } },
        { $group: { _id: "$difficulty", count: { $sum: 1 } } },
      ]),
      Question.countDocuments(activeFilter),
      Question.countDocuments({ userId, dailyTask: null }),
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

    res.status(200).json({
      total,
      backlogCount,
      byStatus: statusMap,
      byCategory: categoryMap,
      byDifficulty: difficultyMap,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching overview stats" });
  }
};

/**
 * GET /api/stats/categories
 * Returns per-category stats with completion rates.
 */
export const getCategoryBreakdown = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const pipeline = await DailyTask.aggregate([
      { $match: { userId } },
      {
        $lookup: {
          from: "questions",
          localField: "_id",
          foreignField: "dailyTask",
          as: "questions",
        },
      },
      { $unwind: "$questions" },
      {
        $group: {
          _id: { category: "$category", status: "$questions.status" },
          count: { $sum: 1 },
        },
      },
    ]);

    const categories: Record<
      string,
      { total: number; solved: number; in_progress: number; pending: number }
    > = {};

    for (const c of Object.values(PrepCategory)) {
      categories[c] = { total: 0, solved: 0, in_progress: 0, pending: 0 };
    }

    for (const row of pipeline) {
      const cat = row._id.category;
      const status = row._id.status as string;
      if (!categories[cat]) continue;
      categories[cat].total += row.count;
      if (status === QuestionStatus.Solved) categories[cat].solved += row.count;
      else if (status === QuestionStatus.InProgress) categories[cat].in_progress += row.count;
      else categories[cat].pending += row.count;
    }

    const breakdown = Object.entries(categories).map(([category, stats]) => ({
      category,
      ...stats,
      completionRate: stats.total > 0 ? Math.round((stats.solved / stats.total) * 100) : 0,
    }));

    res.status(200).json(breakdown);
  } catch (error) {
    res.status(500).json({ message: "Error fetching category breakdown" });
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
      { $match: { userId, dailyTask: { $ne: null }, difficulty: { $ne: null } } },
      {
        $group: {
          _id: { difficulty: "$difficulty", status: "$status" },
          count: { $sum: 1 },
        },
      },
    ]);

    const difficulties: Record<
      string,
      { total: number; solved: number; in_progress: number; pending: number }
    > = {};

    for (const d of Object.values(Difficulty)) {
      difficulties[d] = { total: 0, solved: 0, in_progress: 0, pending: 0 };
    }

    for (const row of pipeline) {
      const diff = row._id.difficulty;
      const status = row._id.status as string;
      if (!difficulties[diff]) continue;
      difficulties[diff].total += row.count;
      if (status === QuestionStatus.Solved) difficulties[diff].solved += row.count;
      else if (status === QuestionStatus.InProgress) difficulties[diff].in_progress += row.count;
      else difficulties[diff].pending += row.count;
    }

    const breakdown = Object.entries(difficulties).map(([difficulty, stats]) => ({
      difficulty,
      ...stats,
      completionRate: stats.total > 0 ? Math.round((stats.solved / stats.total) * 100) : 0,
    }));

    res.status(200).json(breakdown);
  } catch (error) {
    res.status(500).json({ message: "Error fetching difficulty breakdown" });
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
      dailyTask: { $ne: null },
      topic: { $nin: [null, ""] },
    };

    if (req.query.category) {
      const dailyTasks = await DailyTask.find({
        userId,
        category: req.query.category as string,
      }).select("_id");
      matchFilter.dailyTask = { $in: dailyTasks.map((d) => d._id) };
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

    const topics: Record<
      string,
      { total: number; solved: number; in_progress: number; pending: number }
    > = {};

    for (const row of pipeline) {
      const topic = row._id.topic as string;
      const status = row._id.status as string;
      if (!topics[topic]) {
        topics[topic] = { total: 0, solved: 0, in_progress: 0, pending: 0 };
      }
      topics[topic].total += row.count;
      if (status === QuestionStatus.Solved) topics[topic].solved += row.count;
      else if (status === QuestionStatus.InProgress) topics[topic].in_progress += row.count;
      else topics[topic].pending += row.count;
    }

    const breakdown = Object.entries(topics)
      .map(([topic, stats]) => ({
        topic,
        ...stats,
        completionRate: stats.total > 0 ? Math.round((stats.solved / stats.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    res.status(200).json(breakdown);
  } catch (error) {
    res.status(500).json({ message: "Error fetching topic breakdown" });
  }
};

/**
 * GET /api/stats/streaks
 * Returns the current streak and longest streak of consecutive days
 * with at least one completed daily task.
 */
export const getStreaks = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const completions = await DailyTask.aggregate([
      { $match: { userId, status: DailyTaskStatus.Completed } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$date" },
          },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    if (completions.length === 0) {
      res.status(200).json({ currentStreak: 0, longestStreak: 0, totalActiveDays: 0 });
      return;
    }

    const dates = completions.map((c) => c._id as string).sort();

    let longestStreak = 1;
    let currentRun = 1;

    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diffMs = curr.getTime() - prev.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        currentRun++;
      } else {
        currentRun = 1;
      }
      if (currentRun > longestStreak) longestStreak = currentRun;
    }

    const today = toISTMidnight(new Date());
    let currentStreak = 0;
    const checkDate = new Date(today);

    const latestCompletion = dates[dates.length - 1];
    const latestDate = new Date(`${latestCompletion}T00:00:00.000+05:30`);

    const daysSinceLatest = Math.round(
      (today.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceLatest > 1) {
      currentStreak = 0;
    } else {
      const dateSet = new Set(dates);
      checkDate.setTime(latestDate.getTime());

      while (dateSet.has(toISTDateString(checkDate))) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      }
    }

    res.status(200).json({
      currentStreak,
      longestStreak,
      totalActiveDays: dates.length,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching streak stats" });
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
          dailyTask: { $ne: null },
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

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: "Error fetching progress stats" });
  }
};
