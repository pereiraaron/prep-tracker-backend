import { z } from "zod";
import { InterviewOutcome, InterviewStatus, InterviewType } from "../types/interview";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId");

const interviewersArray = z.array(z.string().trim().max(200)).max(20).optional();
const questionIdsArray = z.array(objectId).max(50).optional();

const offerSchema = z.object({
  baseComp: z.string().trim().max(100).optional(),
  equity: z.string().trim().max(100).optional(),
  bonus: z.string().trim().max(100).optional(),
  deadline: z.coerce.date().optional(),
  notes: z.string().max(10000).optional(),
});

const statusOutcomeRefine = (data: {
  status?: InterviewStatus;
  outcome?: InterviewOutcome | null;
}) => {
  if (data.outcome == null) return true;
  // outcome only meaningful when completed (or when explicitly setting completed)
  if (data.status !== undefined && data.status !== InterviewStatus.Completed) return false;
  return true;
};

export const createInterviewSchema = z
  .object({
    applicationId: objectId,
    round: z.number().int().min(1).max(50).optional(),
    type: z.enum(InterviewType),
    status: z.enum(InterviewStatus).optional(),
    outcome: z.enum(InterviewOutcome).optional(),
    scheduledAt: z.coerce.date().optional(),
    durationMins: z.number().int().min(1).max(1440).optional(),
    timezone: z.string().trim().max(100).optional(),
    interviewers: interviewersArray,
    location: z.string().trim().max(2000).optional(),
    notes: z.string().max(50000).optional(),
    outcomeNotes: z.string().max(50000).optional(),
    questionIds: questionIdsArray,
    loopId: z.string().trim().max(100).optional(),
  })
  .refine(statusOutcomeRefine, {
    message: "outcome is only allowed when status is completed",
    path: ["outcome"],
  });

export const updateInterviewSchema = z
  .object({
    round: z.number().int().min(1).max(50).optional(),
    type: z.enum(InterviewType).optional(),
    status: z.enum(InterviewStatus).optional(),
    outcome: z.enum(InterviewOutcome).nullable().optional(),
    scheduledAt: z.coerce.date().nullable().optional(),
    durationMins: z.number().int().min(1).max(1440).nullable().optional(),
    timezone: z.string().trim().max(100).nullable().optional(),
    interviewers: interviewersArray.nullable(),
    location: z.string().trim().max(2000).nullable().optional(),
    notes: z.string().max(50000).nullable().optional(),
    outcomeNotes: z.string().max(50000).nullable().optional(),
    questionIds: questionIdsArray.nullable(),
    loopId: z.string().trim().max(100).nullable().optional(),
  })
  .refine(statusOutcomeRefine, {
    message: "outcome is only allowed when status is completed",
    path: ["outcome"],
  });

export const completeInterviewSchema = z.object({
  outcome: z.enum(InterviewOutcome).default(InterviewOutcome.Awaiting),
  outcomeNotes: z.string().max(50000).optional(),
  questionIds: questionIdsArray,
  completedAt: z.coerce.date().optional(),
  /** When outcome is advanced, create the next round automatically. */
  createNextRound: z.boolean().optional(),
  nextRoundType: z.enum(InterviewType).optional(),
  offer: offerSchema.optional(),
});

export const setInterviewOutcomeSchema = z.object({
  outcome: z.enum(InterviewOutcome),
  outcomeNotes: z.string().max(50000).optional(),
  createNextRound: z.boolean().optional(),
  nextRoundType: z.enum(InterviewType).optional(),
  offer: offerSchema.optional(),
});

export const rescheduleInterviewSchema = z.object({
  scheduledAt: z.coerce.date(),
  durationMins: z.number().int().min(1).max(1440).optional(),
  timezone: z.string().trim().max(100).optional(),
  location: z.string().trim().max(2000).optional(),
  notes: z.string().max(50000).optional(),
});

export const createInterviewLoopSchema = z.object({
  applicationId: objectId,
  timezone: z.string().trim().max(100).optional(),
  location: z.string().trim().max(2000).optional(),
  notes: z.string().max(50000).optional(),
  slots: z
    .array(
      z.object({
        type: z.enum(InterviewType),
        scheduledAt: z.coerce.date(),
        durationMins: z.number().int().min(1).max(1440).optional(),
        interviewers: interviewersArray,
        location: z.string().trim().max(2000).optional(),
        notes: z.string().max(50000).optional(),
        round: z.number().int().min(1).max(50).optional(),
      })
    )
    .min(1)
    .max(20),
});

export { objectId as interviewObjectId };
