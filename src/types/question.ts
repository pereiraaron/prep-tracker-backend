import { Document, Types } from "mongoose";

export enum QuestionStatus {
  Pending = "pending",
  InProgress = "in_progress",
  Solved = "solved",
}

export enum Difficulty {
  Easy = "easy",
  Medium = "medium",
  Hard = "hard",
}

export enum QuestionSource {
  Leetcode = "leetcode",
  GreatFrontend = "greatfrontend",
  Other = "other",
}

export interface IQuestion extends Document {
  taskInstance: Types.ObjectId | null;
  task: Types.ObjectId | null;
  userId: string;
  title: string;
  notes?: string;
  solution?: string;
  status: QuestionStatus;
  difficulty?: Difficulty;
  topic?: string;
  source?: QuestionSource;
  url?: string;
  tags: string[];
  solvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
