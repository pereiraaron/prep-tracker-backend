import { Response } from "express";
import { Application } from "../models/Application";
import { Interview } from "../models/Interview";
import { AuthRequest } from "../types/auth";
import {
  ApplicationSource,
  ApplicationStatus,
  TERMINAL_APPLICATION_STATUSES,
} from "../types/application";
import { sendSuccess, sendPaginated, sendError } from "../utils/response";
import { logger } from "../utils/logger";
import { cache } from "../utils/cache";
import { normalizeCompanyTag } from "../utils/companyTags";
import { applyStatusSideEffects } from "../utils/applicationPipeline";

const INTERVIEW_STATS_KEYS = ["interviews", "applications", "batch"] as const;

const invalidateInterviewStats = async (userId: string) => {
  await Promise.all(
    INTERVIEW_STATS_KEYS.map((key) => cache.invalidate(`stats:${userId}:${key}`))
  );
};

const activeFilter = (userId: string, includeArchived = false) => {
  const filter: Record<string, unknown> = { userId };
  if (!includeArchived) filter.archivedAt = null;
  return filter;
};

const assertThirdParty = (
  source: ApplicationSource | undefined | null,
  thirdParty: unknown,
  existingSource?: ApplicationSource
) => {
  const effective = source === undefined ? existingSource : source ?? undefined;
  if (effective === ApplicationSource.ThirdParty && !thirdParty) {
    return "thirdParty is required when source is third_party";
  }
  if (thirdParty === null && effective === ApplicationSource.ThirdParty) {
    return "Cannot clear thirdParty while source is third_party";
  }
  return null;
};

export const createApplication = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const body = req.body;

    const thirdPartyError = assertThirdParty(body.source, body.thirdParty);
    if (thirdPartyError) {
      sendError(res, thirdPartyError, 400);
      return;
    }

    const status = body.status ?? ApplicationStatus.Wishlist;
    const sideEffects = applyStatusSideEffects(status, {});

    // Assign next priority (append to end of active board)
    const highest = await Application.findOne({ userId, archivedAt: null })
      .sort({ priority: -1 })
      .select("priority")
      .lean();
    const priority = body.priority ?? (highest ? highest.priority + 1 : 0);

    const doc = await Application.create({
      userId,
      company: body.company,
      role: body.role,
      source: body.source,
      thirdParty: body.thirdParty,
      jobUrl: body.jobUrl || undefined,
      location: body.location,
      salaryRange: body.salaryRange,
      notes: body.notes,
      starred: body.starred ?? false,
      priority,
      offer: body.offer,
      ...sideEffects,
      appliedAt: body.appliedAt ?? sideEffects.appliedAt,
      archivedAt: null,
    });

    await invalidateInterviewStats(userId);
    sendSuccess(res, doc.toObject(), 201);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error creating application");
  }
};

export const getAllApplications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const includeArchived = req.query.includeArchived === "true";
    const filter = activeFilter(userId, includeArchived) as Record<string, any>;

    if (req.query.status) filter.status = req.query.status as string;
    if (req.query.source) filter.source = req.query.source as string;
    if (req.query.company) filter.company = normalizeCompanyTag(req.query.company as string);
    if (req.query.starred === "true") filter.starred = true;
    if (req.query.archived === "true") {
      filter.archivedAt = { $ne: null };
    }

    const sortParam = (req.query.sort as string) || "priority";
    const sortDirection = sortParam.startsWith("-") ? -1 : 1;
    const sortField = sortParam.replace(/^-/, "");
    const allowedSorts = ["priority", "updatedAt", "createdAt", "appliedAt", "company", "status"];
    const sort: Record<string, 1 | -1> = allowedSorts.includes(sortField)
      ? { [sortField]: sortDirection }
      : { priority: 1 };

    // Stable board order: priority then updatedAt
    if (sortField === "priority") sort.updatedAt = -1;

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Application.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Application.countDocuments(filter),
    ]);

    sendPaginated(res, items, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching applications");
  }
};

export const getApplicationById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const includeArchived = req.query.includeArchived === "true";
    const filter: Record<string, unknown> = { _id: req.params.id, userId };
    if (!includeArchived) filter.archivedAt = null;

    const doc = await Application.findOne(filter).lean();
    if (!doc) {
      sendError(res, "Application not found", 404);
      return;
    }

    const interviews = await Interview.find({ userId, applicationId: req.params.id })
      .sort({ round: 1, scheduledAt: 1 })
      .lean();

    sendSuccess(res, { ...doc, interviews });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching application");
  }
};

export const updateApplication = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await Application.findOne({ _id: req.params.id, userId, archivedAt: null });
    if (!existing) {
      sendError(res, "Application not found", 404);
      return;
    }

    const body = req.body;
    const thirdPartyError = assertThirdParty(body.source, body.thirdParty, existing.source);
    if (thirdPartyError) {
      sendError(res, thirdPartyError, 400);
      return;
    }

    if (body.company !== undefined) existing.company = body.company;
    if (body.role !== undefined) existing.role = body.role;
    if (body.source !== undefined) existing.source = body.source ?? undefined;
    if (body.thirdParty !== undefined) {
      existing.thirdParty = body.thirdParty ?? undefined;
    }
    if (body.jobUrl !== undefined) existing.jobUrl = body.jobUrl || undefined;
    if (body.location !== undefined) existing.location = body.location ?? undefined;
    if (body.salaryRange !== undefined) existing.salaryRange = body.salaryRange ?? undefined;
    if (body.notes !== undefined) existing.notes = body.notes ?? undefined;
    if (body.appliedAt !== undefined) existing.appliedAt = body.appliedAt ?? undefined;
    if (body.starred !== undefined) existing.starred = body.starred;
    if (body.priority !== undefined) existing.priority = body.priority;
    if (body.offer !== undefined) existing.offer = body.offer ?? undefined;

    if (body.status !== undefined && body.status !== existing.status) {
      Object.assign(existing, applyStatusSideEffects(body.status, existing));
    }

    await existing.save();

    // Keep denormalized company/role in sync on interviews
    if (body.company !== undefined || body.role !== undefined) {
      await Interview.updateMany(
        { userId, applicationId: existing.id },
        {
          ...(body.company !== undefined ? { company: existing.company } : {}),
          ...(body.role !== undefined ? { role: existing.role } : {}),
        }
      );
    }

    await invalidateInterviewStats(userId);
    sendSuccess(res, existing.toObject());
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error updating application");
  }
};

export const updateApplicationStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await Application.findOne({ _id: req.params.id, userId, archivedAt: null });
    if (!existing) {
      sendError(res, "Application not found", 404);
      return;
    }

    const { status, closedAt, offer } = req.body;
    Object.assign(existing, applyStatusSideEffects(status, existing));
    if (closedAt !== undefined && TERMINAL_APPLICATION_STATUSES.includes(status)) {
      existing.closedAt = closedAt;
    }
    if (offer !== undefined) existing.offer = offer;
    if (status === ApplicationStatus.Offer && offer) {
      existing.offer = offer;
    }

    await existing.save();
    await invalidateInterviewStats(userId);
    sendSuccess(res, existing.toObject());
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error updating application status");
  }
};

export const toggleApplicationStarred = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await Application.findOne({ _id: req.params.id, userId, archivedAt: null });
    if (!existing) {
      sendError(res, "Application not found", 404);
      return;
    }
    existing.starred = !existing.starred;
    await existing.save();
    await invalidateInterviewStats(userId);
    sendSuccess(res, existing.toObject());
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error toggling starred");
  }
};

export const reorderApplications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { ids } = req.body as { ids: string[] };

    const apps = await Application.find({
      _id: { $in: ids },
      userId,
      archivedAt: null,
    }).select("_id");

    if (apps.length !== ids.length) {
      sendError(res, "One or more applications not found", 404);
      return;
    }

    const ops = ids.map((id, index) => ({
      updateOne: {
        filter: { _id: id, userId, archivedAt: null },
        update: { $set: { priority: index } },
      },
    }));
    await Application.bulkWrite(ops);

    const items = await Application.find({ userId, archivedAt: null })
      .sort({ priority: 1, updatedAt: -1 })
      .lean();

    await invalidateInterviewStats(userId);
    sendSuccess(res, items);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error reordering applications");
  }
};

export const archiveApplication = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await Application.findOne({ _id: req.params.id, userId, archivedAt: null });
    if (!existing) {
      sendError(res, "Application not found", 404);
      return;
    }
    existing.archivedAt = new Date();
    await existing.save();
    await invalidateInterviewStats(userId);
    sendSuccess(res, existing.toObject());
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error archiving application");
  }
};

export const restoreApplication = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await Application.findOne({
      _id: req.params.id,
      userId,
      archivedAt: { $ne: null },
    });
    if (!existing) {
      sendError(res, "Archived application not found", 404);
      return;
    }
    existing.archivedAt = null;
    await existing.save();
    await invalidateInterviewStats(userId);
    sendSuccess(res, existing.toObject());
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error restoring application");
  }
};

/** Soft-delete (archive) by default; ?hard=true permanently deletes + cascades interviews. */
export const deleteApplication = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const hard = req.query.hard === "true";

    if (!hard) {
      const existing = await Application.findOne({ _id: req.params.id, userId, archivedAt: null });
      if (!existing) {
        sendError(res, "Application not found", 404);
        return;
      }
      existing.archivedAt = new Date();
      await existing.save();
      await invalidateInterviewStats(userId);
      sendSuccess(res, { id: existing.id, archived: true });
      return;
    }

    const existing = await Application.findOneAndDelete({ _id: req.params.id, userId });
    if (!existing) {
      sendError(res, "Application not found", 404);
      return;
    }

    await Interview.deleteMany({ userId, applicationId: req.params.id });
    await invalidateInterviewStats(userId);
    sendSuccess(res, { id: existing.id, deleted: true });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error deleting application");
  }
};

export const bulkArchiveApplications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { ids } = req.body as { ids: string[] };
    const result = await Application.updateMany(
      { _id: { $in: ids }, userId, archivedAt: null },
      { $set: { archivedAt: new Date() } }
    );
    await invalidateInterviewStats(userId);
    sendSuccess(res, { archived: result.modifiedCount });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error archiving applications");
  }
};
