import { Document, Types } from "mongoose";

export enum TaskInstanceStatus {
  Pending = "pending",
  Incomplete = "incomplete",
  InProgress = "in_progress",
  Completed = "completed",
}

export interface ITaskInstance extends Document {
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
  status: TaskInstanceStatus;
  createdAt: Date;
  updatedAt: Date;
}
