import { Response } from "express";
import mongoose from "mongoose";
import { Application } from "../models/Application";
import { Interview } from "../models/Interview";
import { Question } from "../models/Question";
import { AuthRequest } from "../types/auth";
import {
  InterviewOutcome,
  InterviewStatus,
  InterviewType,
  TERMINAL_INTERVIEW_OUTCOMES,
} from "../types/interview";
import { IOfferDetails } from "../types/application";
import { sendSuccess, sendPaginated, sendError } from "../utils/response";
import { logger } from "../utils/logger";
import { cache } from "../utils/cache";
import { normalizeCompanyTag } from "../utils/companyTags";
import {
  assertApplicationActive,
  cascadeApplicationFromOutcome,
  normalizeInterviewOutcomeFields,
  promoteApplicationToInterviewing,
} from "../utils/applicationPipeline";

const invalidateInterviewStats = async (userId: string) => {
  await Promise.all(
    ["interviews", "applications", "batch"].map((key) =>
      cache.invalidate(`stats:${userId}:${key}`)
    )
  );
};

const loadActiveApplication = async (userId: string, applicationId: string) =>
  Application.findOne({ _id: applicationId, userId, archivedAt: null });

const nextRoundNumber = async (userId: string, applicationId: string) => {
  const latest = await Interview.findOne({ userId, applicationId })
    .sort({ round: -1 })
    .select("round")
    .lean();
  return latest ? latest.round + 1 : 1;
};

const validateQuestionIds = async (userId: string, questionIds?: string[] | null) => {
  if (!questionIds?.length) return null;
  const count = await Question.countDocuments({
    userId,
    _id: { $in: questionIds },
  });
  if (count !== questionIds.length) {
    return "One or more questionIds were not found";
  }
  return null;
};

const createNextRoundIfRequested = async (params: {
  userId: string;
  interview: {
    applicationId: string;
    company: string;
    role: string;
    round: number;
    type: InterviewType;
    timezone?: string;
    loopId?: string;
  };
  outcome: InterviewOutcome;
  createNextRound?: boolean;
  nextRoundType?: InterviewType;
  fallbackTimezone?: string;
}) => {
  if (!params.createNextRound || params.outcome !== InterviewOutcome.Advanced) {
    return null;
  }

  const round = await nextRoundNumber(params.userId, params.interview.applicationId);
  const doc = await Interview.create({
    userId: params.userId,
    applicationId: params.interview.applicationId,
    company: params.interview.company,
    role: params.interview.role,
    round,
    type: params.nextRoundType ?? params.interview.type,
    status: InterviewStatus.Scheduled,
    timezone: params.interview.timezone ?? params.fallbackTimezone,
    interviewers: [],
    questionIds: [],
    loopId: params.interview.loopId,
  });
  return doc.toObject();
};

const applyOutcomeSideEffects = async (params: {
  userId: string;
  interview: {
    applicationId: string;
    company: string;
    role: string;
    round: number;
    type: InterviewType;
    timezone?: string;
    loopId?: string;
  };
  outcome: InterviewOutcome;
  createNextRound?: boolean;
  nextRoundType?: InterviewType;
  offer?: IOfferDetails;
  fallbackTimezone?: string;
}) => {
  await cascadeApplicationFromOutcome(
    params.userId,
    params.interview.applicationId,
    params.outcome,
    { offer: params.offer }
  );

  return createNextRoundIfRequested(params);
};

export const createInterview = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const body = req.body;

    const application = await loadActiveApplication(userId, body.applicationId);
    if (!application) {
      sendError(res, "Application not found", 404);
      return;
    }

    const questionError = await validateQuestionIds(userId, body.questionIds);
    if (questionError) {
      sendError(res, questionError, 400);
      return;
    }

    const status = body.status ?? InterviewStatus.Scheduled;
    const normalized = normalizeInterviewOutcomeFields({
      status,
      outcome: body.outcome,
      completedAt: status === InterviewStatus.Completed ? new Date() : undefined,
    });

    const round = body.round ?? (await nextRoundNumber(userId, body.applicationId));

    const doc = await Interview.create({
      userId,
      applicationId: body.applicationId,
      company: application.company,
      role: application.role,
      round,
      type: body.type,
      status: normalized.status,
      outcome: normalized.outcome ?? undefined,
      scheduledAt: body.scheduledAt,
      durationMins: body.durationMins,
      timezone: body.timezone ?? req.user?.timezone,
      interviewers: body.interviewers ?? [],
      location: body.location,
      notes: body.notes,
      outcomeNotes: body.outcomeNotes,
      questionIds: body.questionIds ?? [],
      loopId: body.loopId,
      completedAt: normalized.completedAt ?? undefined,
    });

    await promoteApplicationToInterviewing(userId, body.applicationId);

    if (
      normalized.status === InterviewStatus.Completed &&
      normalized.outcome &&
      TERMINAL_INTERVIEW_OUTCOMES.includes(normalized.outcome)
    ) {
      await cascadeApplicationFromOutcome(userId, body.applicationId, normalized.outcome);
    }

    await invalidateInterviewStats(userId);
    sendSuccess(res, doc.toObject(), 201);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error creating interview");
  }
};

export const getAllInterviews = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const filter: Record<string, any> = { userId };

    if (req.query.applicationId) filter.applicationId = req.query.applicationId as string;
    if (req.query.status) filter.status = req.query.status as string;
    if (req.query.outcome) filter.outcome = req.query.outcome as string;
    if (req.query.type) filter.type = req.query.type as string;
    if (req.query.company) filter.company = normalizeCompanyTag(req.query.company as string);
    if (req.query.loopId) filter.loopId = req.query.loopId as string;

    // Upcoming: scheduled in the future (or today+)
    if (req.query.upcoming === "true") {
      filter.status = InterviewStatus.Scheduled;
      filter.scheduledAt = { $gte: new Date() };
    }

    if (req.query.scheduledAfter || req.query.scheduledBefore) {
      const after = req.query.scheduledAfter
        ? new Date(req.query.scheduledAfter as string)
        : null;
      const before = req.query.scheduledBefore
        ? new Date(req.query.scheduledBefore as string)
        : null;
      if ((after && !isNaN(after.getTime())) || (before && !isNaN(before.getTime()))) {
        filter.scheduledAt = filter.scheduledAt || {};
        if (after && !isNaN(after.getTime())) filter.scheduledAt.$gte = after;
        if (before && !isNaN(before.getTime())) filter.scheduledAt.$lte = before;
      }
    }

    const sortParam = (req.query.sort as string) || "scheduledAt";
    const sortDirection = sortParam.startsWith("-") ? -1 : 1;
    const sortField = sortParam.replace(/^-/, "");
    const allowedSorts = ["scheduledAt", "round", "createdAt", "updatedAt", "company"];
    const sort: Record<string, 1 | -1> = allowedSorts.includes(sortField)
      ? { [sortField]: sortDirection }
      : { scheduledAt: 1 };

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Interview.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Interview.countDocuments(filter),
    ]);

    sendPaginated(res, items, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching interviews");
  }
};

export const getInterviewById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const doc = await Interview.findOne({ _id: req.params.id, userId }).lean();
    if (!doc) {
      sendError(res, "Interview not found", 404);
      return;
    }
    sendSuccess(res, doc);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching interview");
  }
};

export const updateInterview = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await Interview.findOne({ _id: req.params.id, userId });
    if (!existing) {
      sendError(res, "Interview not found", 404);
      return;
    }

    const archivedError = await assertApplicationActive(userId, existing.applicationId);
    if (archivedError) {
      sendError(res, archivedError, archivedError === "Application not found" ? 404 : 400);
      return;
    }

    if (existing.status === InterviewStatus.Rescheduled) {
      sendError(res, "Cannot update a rescheduled interview; edit the replacement instead", 400);
      return;
    }

    const body = req.body;
    const questionError = await validateQuestionIds(userId, body.questionIds);
    if (questionError) {
      sendError(res, questionError, 400);
      return;
    }

    if (body.round !== undefined) existing.round = body.round;
    if (body.type !== undefined) existing.type = body.type;
    if (body.scheduledAt !== undefined) existing.scheduledAt = body.scheduledAt ?? undefined;
    if (body.durationMins !== undefined) existing.durationMins = body.durationMins ?? undefined;
    if (body.timezone !== undefined) existing.timezone = body.timezone ?? undefined;
    if (body.interviewers !== undefined) existing.interviewers = body.interviewers ?? [];
    if (body.location !== undefined) existing.location = body.location ?? undefined;
    if (body.notes !== undefined) existing.notes = body.notes ?? undefined;
    if (body.outcomeNotes !== undefined) existing.outcomeNotes = body.outcomeNotes ?? undefined;
    if (body.questionIds !== undefined) existing.questionIds = body.questionIds ?? [];
    if (body.loopId !== undefined) existing.loopId = body.loopId ?? undefined;

    const nextStatus = body.status ?? existing.status;
    const normalized = normalizeInterviewOutcomeFields({
      status: nextStatus,
      outcome: body.outcome !== undefined ? body.outcome : existing.outcome,
      completedAt:
        body.status === InterviewStatus.Completed && !existing.completedAt
          ? new Date()
          : existing.completedAt,
    });

    existing.status = normalized.status!;
    existing.outcome = normalized.outcome ?? undefined;
    existing.completedAt = normalized.completedAt ?? undefined;

    await existing.save();

    if (
      existing.status === InterviewStatus.Completed &&
      existing.outcome &&
      (body.outcome !== undefined || body.status !== undefined)
    ) {
      await cascadeApplicationFromOutcome(userId, existing.applicationId, existing.outcome);
    }

    await invalidateInterviewStats(userId);
    sendSuccess(res, existing.toObject());
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error updating interview");
  }
};

export const completeInterview = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await Interview.findOne({ _id: req.params.id, userId });
    if (!existing) {
      sendError(res, "Interview not found", 404);
      return;
    }

    const archivedError = await assertApplicationActive(userId, existing.applicationId);
    if (archivedError) {
      sendError(res, archivedError, archivedError === "Application not found" ? 404 : 400);
      return;
    }

    if (existing.status === InterviewStatus.Rescheduled) {
      sendError(res, "Cannot complete a rescheduled interview", 400);
      return;
    }

    if (existing.status === InterviewStatus.Completed) {
      sendError(res, "Interview is already completed; use the outcome endpoint to update it", 400);
      return;
    }

    const { outcome, outcomeNotes, questionIds, completedAt, createNextRound, nextRoundType, offer } =
      req.body;
    const questionError = await validateQuestionIds(userId, questionIds);
    if (questionError) {
      sendError(res, questionError, 400);
      return;
    }

    existing.status = InterviewStatus.Completed;
    existing.outcome = outcome ?? InterviewOutcome.Awaiting;
    existing.completedAt = completedAt ?? new Date();
    if (outcomeNotes !== undefined) existing.outcomeNotes = outcomeNotes;
    if (questionIds !== undefined) existing.questionIds = questionIds;

    await existing.save();

    const nextRound = existing.outcome
      ? await applyOutcomeSideEffects({
          userId,
          interview: existing,
          outcome: existing.outcome,
          createNextRound,
          nextRoundType,
          offer,
          fallbackTimezone: req.user?.timezone,
        })
      : null;

    await invalidateInterviewStats(userId);
    sendSuccess(res, { interview: existing.toObject(), nextRound });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error completing interview");
  }
};

export const setInterviewOutcome = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await Interview.findOne({ _id: req.params.id, userId });
    if (!existing) {
      sendError(res, "Interview not found", 404);
      return;
    }

    const archivedError = await assertApplicationActive(userId, existing.applicationId);
    if (archivedError) {
      sendError(res, archivedError, archivedError === "Application not found" ? 404 : 400);
      return;
    }

    if (existing.status !== InterviewStatus.Completed) {
      sendError(res, "Outcome can only be set on completed interviews", 400);
      return;
    }

    const { outcome, outcomeNotes, createNextRound, nextRoundType, offer } = req.body;
    existing.outcome = outcome;
    if (outcomeNotes !== undefined) existing.outcomeNotes = outcomeNotes;
    await existing.save();

    const nextRound = await applyOutcomeSideEffects({
      userId,
      interview: existing,
      outcome,
      createNextRound,
      nextRoundType,
      offer,
      fallbackTimezone: req.user?.timezone,
    });

    await invalidateInterviewStats(userId);
    sendSuccess(res, { interview: existing.toObject(), nextRound });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error setting interview outcome");
  }
};

/**
 * Mark the current interview as rescheduled and create a replacement row
 * preserving round/type/loop and carrying forward notes/interviewers.
 */
export const rescheduleInterview = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await Interview.findOne({ _id: req.params.id, userId });
    if (!existing) {
      sendError(res, "Interview not found", 404);
      return;
    }

    const archivedError = await assertApplicationActive(userId, existing.applicationId);
    if (archivedError) {
      sendError(res, archivedError, archivedError === "Application not found" ? 404 : 400);
      return;
    }

    if (
      existing.status === InterviewStatus.Rescheduled ||
      existing.status === InterviewStatus.Cancelled
    ) {
      sendError(res, "Interview cannot be rescheduled", 400);
      return;
    }

    const { scheduledAt, durationMins, timezone, location, notes } = req.body;

    const replacement = await Interview.create({
      userId,
      applicationId: existing.applicationId,
      company: existing.company,
      role: existing.role,
      round: existing.round,
      type: existing.type,
      status: InterviewStatus.Scheduled,
      scheduledAt,
      durationMins: durationMins ?? existing.durationMins,
      timezone: timezone ?? existing.timezone ?? req.user?.timezone,
      interviewers: existing.interviewers ?? [],
      location: location ?? existing.location,
      notes: notes ?? existing.notes,
      questionIds: existing.questionIds ?? [],
      loopId: existing.loopId,
    });

    existing.status = InterviewStatus.Rescheduled;
    existing.outcome = undefined;
    existing.rescheduledToId = replacement.id;
    try {
      await existing.save();
    } catch (saveError) {
      // Compensating action: don't leave two active rounds for the same slot
      await Interview.deleteOne({ _id: replacement.id, userId });
      throw saveError;
    }

    await invalidateInterviewStats(userId);
    sendSuccess(res, {
      previous: existing.toObject(),
      interview: replacement.toObject(),
    });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error rescheduling interview");
  }
};

export const deleteInterview = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await Interview.findOneAndDelete({ _id: req.params.id, userId });
    if (!existing) {
      sendError(res, "Interview not found", 404);
      return;
    }
    await invalidateInterviewStats(userId);
    sendSuccess(res, { id: existing.id, deleted: true });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error deleting interview");
  }
};

/** Create multiple same-day onsite slots under a shared loopId. */
export const createInterviewLoop = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { applicationId, slots, timezone, location, notes } = req.body as {
      applicationId: string;
      timezone?: string;
      location?: string;
      notes?: string;
      slots: Array<{
        type: string;
        scheduledAt: Date;
        durationMins?: number;
        interviewers?: string[];
        location?: string;
        notes?: string;
        round?: number;
      }>;
    };

    const application = await loadActiveApplication(userId, applicationId);
    if (!application) {
      sendError(res, "Application not found", 404);
      return;
    }

    if (!slots?.length) {
      sendError(res, "slots must be a non-empty array", 400);
      return;
    }

    const loopId = new mongoose.Types.ObjectId().toString();
    let round = await nextRoundNumber(userId, applicationId);

    const docs = [];
    for (const slot of slots) {
      const created = await Interview.create({
        userId,
        applicationId,
        company: application.company,
        role: application.role,
        round: slot.round ?? round,
        type: slot.type,
        status: InterviewStatus.Scheduled,
        scheduledAt: slot.scheduledAt,
        durationMins: slot.durationMins,
        timezone: timezone ?? req.user?.timezone,
        interviewers: slot.interviewers ?? [],
        location: slot.location ?? location,
        notes: slot.notes ?? notes,
        questionIds: [],
        loopId,
      });
      docs.push(created.toObject());
      if (slot.round === undefined) round += 1;
    }

    await promoteApplicationToInterviewing(userId, applicationId);
    await invalidateInterviewStats(userId);
    sendSuccess(res, { loopId, interviews: docs }, 201);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error creating interview loop");
  }
};
