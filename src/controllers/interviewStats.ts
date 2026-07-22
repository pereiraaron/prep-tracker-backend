import { Response } from "express";
import { Application } from "../models/Application";
import { Interview } from "../models/Interview";
import { Question } from "../models/Question";
import { AuthRequest } from "../types/auth";
import { ApplicationStatus } from "../types/application";
import { InterviewOutcome, InterviewStatus } from "../types/interview";
import { sendSuccess, sendError } from "../utils/response";
import { logger } from "../utils/logger";
import { cache } from "../utils/cache";
import { STATS_CACHE_TTL_MS } from "../utils/aggregation";
import { normalizeCompanyTag } from "../utils/companyTags";

const handleStat = async (
  req: AuthRequest,
  res: Response,
  cacheKey: string,
  compute: () => Promise<unknown>,
  errorMsg: string
) => {
  try {
    if (req.query.refresh !== "true") {
      const cached = await cache.get(cacheKey);
      if (cached) {
        sendSuccess(res, cached);
        return;
      }
    }
    const data = await compute();
    await cache.set(cacheKey, data, STATS_CACHE_TTL_MS);
    sendSuccess(res, data);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, errorMsg);
  }
};

export async function computeApplicationStats(userId: string) {
  const [facet] = await Application.aggregate([
    { $match: { userId, archivedAt: null } },
    {
      $facet: {
        byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        bySource: [
          { $match: { source: { $ne: null } } },
          { $group: { _id: "$source", count: { $sum: 1 } } },
        ],
        byCompany: [
          { $group: { _id: "$company", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ],
        starred: [{ $match: { starred: true } }, { $count: "count" }],
        total: [{ $count: "count" }],
      },
    },
  ]);

  const statusMap: Record<string, number> = {};
  for (const s of Object.values(ApplicationStatus)) statusMap[s] = 0;
  for (const row of facet.byStatus) statusMap[row._id] = row.count;

  return {
    total: facet.total[0]?.count ?? 0,
    starred: facet.starred[0]?.count ?? 0,
    byStatus: statusMap,
    bySource: Object.fromEntries(facet.bySource.map((r: { _id: string; count: number }) => [r._id, r.count])),
    topCompanies: facet.byCompany.map((r: { _id: string; count: number }) => ({
      company: r._id,
      count: r.count,
    })),
  };
}

export async function computeInterviewStats(userId: string) {
  const now = new Date();
  const [facet] = await Interview.aggregate([
    { $match: { userId } },
    {
      $facet: {
        byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        byOutcome: [
          { $match: { outcome: { $ne: null } } },
          { $group: { _id: "$outcome", count: { $sum: 1 } } },
        ],
        byType: [{ $group: { _id: "$type", count: { $sum: 1 } } }],
        upcoming: [
          {
            $match: {
              status: InterviewStatus.Scheduled,
              scheduledAt: { $gte: now },
            },
          },
          { $sort: { scheduledAt: 1 } },
          { $limit: 10 },
          {
            $project: {
              _id: 1,
              applicationId: 1,
              company: 1,
              role: 1,
              round: 1,
              type: 1,
              scheduledAt: 1,
              loopId: 1,
            },
          },
        ],
        awaiting: [
          {
            $match: {
              status: InterviewStatus.Completed,
              outcome: InterviewOutcome.Awaiting,
            },
          },
          { $count: "count" },
        ],
        total: [{ $count: "count" }],
      },
    },
  ]);

  const statusMap: Record<string, number> = {};
  for (const s of Object.values(InterviewStatus)) statusMap[s] = 0;
  for (const row of facet.byStatus) statusMap[row._id] = row.count;

  const outcomeMap: Record<string, number> = {};
  for (const o of Object.values(InterviewOutcome)) outcomeMap[o] = 0;
  for (const row of facet.byOutcome) outcomeMap[row._id] = row.count;

  return {
    total: facet.total[0]?.count ?? 0,
    awaitingFeedback: facet.awaiting[0]?.count ?? 0,
    byStatus: statusMap,
    byOutcome: outcomeMap,
    byType: Object.fromEntries(facet.byType.map((r: { _id: string; count: number }) => [r._id, r.count])),
    upcoming: facet.upcoming,
  };
}

/** Prep questions tagged with the same company as an active application. */
export async function computePrepForCompany(userId: string, company: string) {
  const normalized = normalizeCompanyTag(company);
  const [questions, applications] = await Promise.all([
    Question.find({
      userId,
      companyTags: normalized,
    })
      .select("title status difficulty category topics companyTags starred solvedAt")
      .sort({ status: -1, solvedAt: -1 })
      .limit(50)
      .lean(),
    Application.find({ userId, company: normalized, archivedAt: null })
      .select("role status priority")
      .lean(),
  ]);

  return {
    company: normalized,
    applications,
    questions,
    solvedCount: questions.filter((q) => q.status === "solved").length,
    pendingCount: questions.filter((q) => q.status === "pending").length,
  };
}

export const getApplicationStats = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  await handleStat(
    req,
    res,
    `stats:${userId}:applications`,
    () => computeApplicationStats(userId),
    "Error fetching application stats"
  );
};

export const getInterviewStats = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  await handleStat(
    req,
    res,
    `stats:${userId}:interviews`,
    () => computeInterviewStats(userId),
    "Error fetching interview stats"
  );
};

export const getPrepForCompany = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const company = req.query.company as string;
    if (!company?.trim()) {
      sendError(res, "company query param is required", 400);
      return;
    }
    const data = await computePrepForCompany(userId, company);
    sendSuccess(res, data);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching prep for company");
  }
};
