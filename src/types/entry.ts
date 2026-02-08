import { Document, Types } from "mongoose";

export enum EntryStatus {
  Pending = "pending",
  InProgress = "in_progress",
  Completed = "completed",
}

export enum RecurrenceFrequency {
  Daily = "daily",
  Weekly = "weekly",
  Custom = "custom",
}

export interface IRecurrence {
  frequency: RecurrenceFrequency;
  daysOfWeek?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
}

export interface IEntry extends Document {
  title: string;
  notes?: string;
  status: EntryStatus;
  type: Types.ObjectId;
  subtype?: Types.ObjectId;
  tags: string[];
  userId: string;
  deadline: Date;
  isRecurring: boolean;
  recurrence?: IRecurrence;
  recurringEndDate?: Date;
  metadata?: Map<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
