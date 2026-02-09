import { Document } from "mongoose";
import { PrepCategory } from "./category";

export enum EntryStatus {
  Pending = "pending",
  InProgress = "in_progress",
  Completed = "completed",
}

export enum Difficulty {
  Easy = "easy",
  Medium = "medium",
  Hard = "hard",
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
  solution?: string;
  status: EntryStatus;
  category: PrepCategory;
  topic?: string;
  difficulty?: Difficulty;
  source?: string;
  url?: string;
  tags: string[];
  userId: string;
  deadline: Date;
  isRecurring: boolean;
  recurrence?: IRecurrence;
  recurringEndDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}
