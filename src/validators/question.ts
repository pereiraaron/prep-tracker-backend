import { z } from "zod";
import { Difficulty, QuestionSource } from "../types/question";
import { PrepCategory } from "../types/category";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId");

export const createQuestionSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
  notes: z.string().max(50000).optional(),
  solution: z.string().min(1, "Solution is required").max(50000),
  difficulty: z.enum(Difficulty).optional(),
  topic: z.string().max(100).optional(),
  source: z.enum(QuestionSource).optional(),
  url: z.url().max(2000).optional().or(z.literal("")),
  tags: z.array(z.string().max(50)).max(20).optional(),
  companyTags: z.array(z.string().max(50)).max(20).optional(),
  category: z.enum(PrepCategory),
});

export const updateQuestionSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  notes: z.string().max(50000).optional(),
  solution: z.string().max(50000).optional(),
  difficulty: z.enum(Difficulty).nullable().optional(),
  topic: z.string().max(100).nullable().optional(),
  source: z.enum(QuestionSource).nullable().optional(),
  url: z.url().max(2000).optional().or(z.literal("")).nullable(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  companyTags: z.array(z.string().max(50)).max(20).optional(),
  category: z.enum(PrepCategory).nullable().optional(),
});

export const createBacklogQuestionSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
  notes: z.string().max(50000).optional(),
  solution: z.string().max(50000).optional(),
  difficulty: z.enum(Difficulty).optional(),
  topic: z.string().max(100).optional(),
  source: z.enum(QuestionSource).optional(),
  url: z.url().max(2000).optional().or(z.literal("")),
  tags: z.array(z.string().max(50)).max(20).optional(),
  companyTags: z.array(z.string().max(50)).max(20).optional(),
});

export const bulkDeleteSchema = z.object({
  ids: z.array(objectId).min(1, "ids must be a non-empty array").max(100),
});
