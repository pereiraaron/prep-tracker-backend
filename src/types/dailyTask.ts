import { Document, Types } from "mongoose";

export enum DailyTaskStatus {
  Pending = "pending",
  Incomplete = "incomplete",
  InProgress = "in_progress",
  Completed = "completed",
}

export interface IDailyTask extends Document {
  task: Types.ObjectId;
  userId: string;
  date: Date;
  // snapshot fields
  taskName: string;
  category: string;
  targetQuestionCount: number;
  // computed counters
  addedQuestionCount: number;
  solvedQuestionCount: number;
  // status
  status: DailyTaskStatus;
  createdAt: Date;
  updatedAt: Date;
}
