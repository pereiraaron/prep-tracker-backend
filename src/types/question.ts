import { Document } from "mongoose";
import { PrepCategory } from "./category";

export enum QuestionStatus {
  Pending = "pending",
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
  GeeksforGeeks = "geeksforgeeks",
  Linkedin = "linkedin",
  Medium = "medium",
  Other = "other",
}

export interface IQuestion extends Document {
  userId: string;
  category: PrepCategory | null;
  title: string;
  notes?: string;
  solution?: string;
  status: QuestionStatus;
  difficulty?: Difficulty;
  topic?: string;
  source?: QuestionSource;
  url?: string;
  tags: string[];
  companyTags: string[];
  starred: boolean;
  solvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
