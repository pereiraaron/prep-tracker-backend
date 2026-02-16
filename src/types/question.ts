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

export interface IRevision {
  notes?: string;
  solution?: string;
  editedAt: Date;
}

export const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60];

export interface IQuestion extends Document {
  dailyTask: Types.ObjectId | null;
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
  starred: boolean;
  revisions: IRevision[];
  reviewCount: number;
  nextReviewAt?: Date;
  lastReviewedAt?: Date;
  solvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
