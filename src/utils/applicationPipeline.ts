import {
  ApplicationStatus,
  IApplication,
  IOfferDetails,
  TERMINAL_APPLICATION_STATUSES,
} from "../types/application";
import {
  InterviewOutcome,
  InterviewStatus,
  TERMINAL_INTERVIEW_OUTCOMES,
  interviewOutcomeToApplicationStatus,
} from "../types/interview";
import { Application } from "../models/Application";

export const isTerminalApplicationStatus = (status: ApplicationStatus) =>
  TERMINAL_APPLICATION_STATUSES.includes(status);

export type ApplicationStatusPatch = {
  status: ApplicationStatus;
  appliedAt?: Date;
  closedAt?: Date | null;
};

export const applyStatusSideEffects = (
  status: ApplicationStatus,
  existing?: Partial<IApplication>
): ApplicationStatusPatch => {
  const patch: ApplicationStatusPatch = { status };

  if (status === ApplicationStatus.Applied && !existing?.appliedAt) {
    patch.appliedAt = new Date();
  }

  if (isTerminalApplicationStatus(status)) {
    patch.closedAt = existing?.closedAt ?? new Date();
  } else {
    patch.closedAt = null;
  }

  return patch;
};

export type CascadeOutcomeOptions = {
  offer?: IOfferDetails;
};

/** Cascade Application.status from a completed interview outcome. */
export const cascadeApplicationFromOutcome = async (
  userId: string,
  applicationId: string,
  outcome: InterviewOutcome,
  options?: CascadeOutcomeOptions
) => {
  const nextStatus = interviewOutcomeToApplicationStatus[outcome];
  if (!nextStatus) return null;

  const app = await Application.findOne({ _id: applicationId, userId, archivedAt: null });
  if (!app) return null;

  // Don't reopen a closed app from a non-terminal outcome; advanced keeps interviewing
  if (
    isTerminalApplicationStatus(app.status) &&
    !TERMINAL_INTERVIEW_OUTCOMES.includes(outcome)
  ) {
    return app;
  }

  const patch = applyStatusSideEffects(nextStatus, app);
  Object.assign(app, patch);

  if (outcome === InterviewOutcome.Offer && options?.offer) {
    app.offer = options.offer;
  }

  await app.save();
  return app;
};

/** Move wishlist/applied → interviewing when first active interview is created. */
export const promoteApplicationToInterviewing = async (
  userId: string,
  applicationId: string
) => {
  const app = await Application.findOne({ _id: applicationId, userId, archivedAt: null });
  if (!app) return null;

  if (
    app.status === ApplicationStatus.Wishlist ||
    app.status === ApplicationStatus.Applied
  ) {
    app.status = ApplicationStatus.Interviewing;
    app.closedAt = undefined;
    await app.save();
  }
  return app;
};

/** Returns an error message if the application is missing or archived. */
export const assertApplicationActive = async (
  userId: string,
  applicationId: string
): Promise<string | null> => {
  const app = await Application.findOne({ _id: applicationId, userId });
  if (!app) return "Application not found";
  if (app.archivedAt) return "Application is archived";
  return null;
};

export const normalizeInterviewOutcomeFields = (input: {
  status?: InterviewStatus;
  outcome?: InterviewOutcome | null;
  completedAt?: Date | null;
}) => {
  const result: {
    status?: InterviewStatus;
    outcome?: InterviewOutcome | null;
    completedAt?: Date | null;
  } = { ...input };

  if (result.status && result.status !== InterviewStatus.Completed) {
    result.outcome = null;
    result.completedAt = null;
  }

  if (result.status === InterviewStatus.Completed) {
    if (!result.outcome) result.outcome = InterviewOutcome.Awaiting;
    if (!result.completedAt) result.completedAt = new Date();
  }

  return result;
};
