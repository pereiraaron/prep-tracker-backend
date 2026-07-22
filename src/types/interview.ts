import { Document } from "mongoose";
import { ApplicationStatus } from "./application";

export enum InterviewType {
  RecruiterScreen = "recruiter_screen",
  Phone = "phone",
  Technical = "technical",
  SystemDesign = "system_design",
  Behavioral = "behavioral",
  HiringManager = "hiring_manager",
  Onsite = "onsite",
  Final = "final",
  Other = "other",
}

/** Lifecycle of a round — did it happen? */
export enum InterviewStatus {
  Scheduled = "scheduled",
  Completed = "completed",
  Cancelled = "cancelled",
  NoShow = "no_show",
  Rescheduled = "rescheduled",
}

/** Result after a completed round. */
export enum InterviewOutcome {
  Awaiting = "awaiting",
  Advanced = "advanced",
  Offer = "offer",
  Rejected = "rejected",
  Ghosted = "ghosted",
  Withdrawn = "withdrawn",
}

/** Outcomes that should cascade onto Application.status. */
export const TERMINAL_INTERVIEW_OUTCOMES: InterviewOutcome[] = [
  InterviewOutcome.Offer,
  InterviewOutcome.Rejected,
  InterviewOutcome.Ghosted,
  InterviewOutcome.Withdrawn,
];

export const interviewOutcomeToApplicationStatus: Record<
  InterviewOutcome,
  ApplicationStatus | null
> = {
  [InterviewOutcome.Awaiting]: null,
  [InterviewOutcome.Advanced]: ApplicationStatus.Interviewing,
  [InterviewOutcome.Offer]: ApplicationStatus.Offer,
  [InterviewOutcome.Rejected]: ApplicationStatus.Rejected,
  [InterviewOutcome.Ghosted]: ApplicationStatus.Ghosted,
  [InterviewOutcome.Withdrawn]: ApplicationStatus.Withdrawn,
};

export interface IInterview extends Document {
  userId: string;
  applicationId: string;
  /** Denormalized from Application for calendar / list queries. */
  company: string;
  role: string;
  round: number;
  type: InterviewType;
  status: InterviewStatus;
  outcome?: InterviewOutcome;
  scheduledAt?: Date;
  durationMins?: number;
  timezone?: string;
  interviewers?: string[];
  location?: string;
  notes?: string;
  outcomeNotes?: string;
  /** Soft links to Question._id values asked in this round. */
  questionIds?: string[];
  /**
   * Groups same-day multi-slot onsites (e.g. three back-to-back rounds).
   * Shared opaque id across sibling Interview docs.
   */
  loopId?: string;
  completedAt?: Date;
  /** When this row was superseded via reschedule, points at the replacement. */
  rescheduledToId?: string;
  createdAt: Date;
  updatedAt: Date;
}
