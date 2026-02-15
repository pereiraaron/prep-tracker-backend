import { Document } from "mongoose";
import { PrepCategory } from "./category";

export enum TaskStatus {
  Active = "active",
  Completed = "completed",
}

export enum RecurrenceFrequency {
  Daily = "daily",
  Weekly = "weekly",
  Biweekly = "biweekly",
  Monthly = "monthly",
  Custom = "custom",
}

export interface IRecurrence {
  frequency: RecurrenceFrequency;
  daysOfWeek?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  interval?: number; // for custom - every N days
  startDate: Date; // when recurrence begins
}

export interface ITask extends Document {
  name: string;
  userId: string;
  category: PrepCategory;
  targetQuestionCount: number;
  isRecurring: boolean;
  recurrence?: IRecurrence;
  endDate?: Date;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
}
