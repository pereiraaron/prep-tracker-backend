import { Schema, model } from "mongoose";
import {
  IInterview,
  InterviewOutcome,
  InterviewStatus,
  InterviewType,
} from "../types/interview";

const interviewSchema = new Schema<IInterview>(
  {
    userId: { $type: String, required: true },
    applicationId: { $type: String, required: true },
    company: { $type: String, required: true, trim: true, maxlength: 200 },
    role: { $type: String, required: true, trim: true, maxlength: 200 },
    round: { $type: Number, required: true, min: 1, max: 50 },
    type: {
      $type: String,
      enum: Object.values(InterviewType),
      required: true,
    },
    status: {
      $type: String,
      enum: Object.values(InterviewStatus),
      default: InterviewStatus.Scheduled,
    },
    outcome: {
      $type: String,
      enum: Object.values(InterviewOutcome),
    },
    scheduledAt: { $type: Date },
    durationMins: { $type: Number, min: 1, max: 1440 },
    timezone: { $type: String, trim: true, maxlength: 100 },
    interviewers: {
      $type: [String],
      default: [],
      validate: [(v: string[]) => v.length <= 20, "Cannot have more than 20 interviewers"],
    },
    location: { $type: String, trim: true, maxlength: 2000 },
    notes: { $type: String, trim: true, maxlength: 50000 },
    outcomeNotes: { $type: String, trim: true, maxlength: 50000 },
    questionIds: {
      $type: [String],
      default: [],
      validate: [(v: string[]) => v.length <= 50, "Cannot have more than 50 questionIds"],
    },
    loopId: { $type: String, trim: true, maxlength: 100 },
    completedAt: { $type: Date },
    rescheduledToId: { $type: String },
  },
  {
    timestamps: true,
    typeKey: "$type",
  }
);

interviewSchema.index({ userId: 1, scheduledAt: 1 });
interviewSchema.index({ userId: 1, applicationId: 1, round: 1 });
interviewSchema.index({ userId: 1, status: 1, scheduledAt: 1 });
interviewSchema.index({ userId: 1, company: 1, scheduledAt: 1 });
interviewSchema.index({ userId: 1, loopId: 1 });
interviewSchema.index({ userId: 1, applicationId: 1, status: 1 });

export const Interview = model("Interview", interviewSchema);
