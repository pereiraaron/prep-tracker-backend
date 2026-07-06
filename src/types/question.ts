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
  MiniChallenges = "minichallenges",
  GeeksforGeeks = "geeksforgeeks",
  Linkedin = "linkedin",
  Medium = "medium",
  NamasteDSA = "namastedsa",
  FMC = "fmc",
  Other = "other",
}

export interface ISolution {
  label?: string;
  content: string;
}

export interface IQuestion extends Document {
  userId: string;
  category: PrepCategory | null;
  title: string;
  notes?: string;
  solutions?: ISolution[];
  status: QuestionStatus;
  difficulty?: Difficulty;
  topics: string[];
  source?: QuestionSource;
  url?: string;
  tags: string[];
  companyTags: string[];
  starred: boolean;
  templates?: Map<string, string>;
  solvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
