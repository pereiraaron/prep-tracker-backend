import { z } from "zod";
import { Difficulty, QuestionSource } from "../types/question";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId");

export const createQuestionSchema = z.object({
  dailyTaskId: objectId,
  title: z.string().trim().min(1, "Title is required").max(500),
  notes: z.string().max(50000).optional(),
  solution: z.string().max(50000).optional(),
  difficulty: z.nativeEnum(Difficulty).optional(),
  topic: z.string().max(100).optional(),
  source: z.nativeEnum(QuestionSource).optional(),
  url: z.string().url().max(2000).optional().or(z.literal("")),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const updateQuestionSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  notes: z.string().max(50000).optional(),
  solution: z.string().max(50000).optional(),
  difficulty: z.nativeEnum(Difficulty).nullable().optional(),
  topic: z.string().max(100).nullable().optional(),
  source: z.nativeEnum(QuestionSource).nullable().optional(),
  url: z.string().url().max(2000).optional().or(z.literal("")).nullable(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const createBacklogQuestionSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
  notes: z.string().max(50000).optional(),
  solution: z.string().max(50000).optional(),
  difficulty: z.nativeEnum(Difficulty).optional(),
  topic: z.string().max(100).optional(),
  source: z.nativeEnum(QuestionSource).optional(),
  url: z.string().url().max(2000).optional().or(z.literal("")),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const bulkDeleteSchema = z.object({
  ids: z.array(objectId).min(1, "ids must be a non-empty array").max(100),
});

export const moveToDailyTaskSchema = z.object({
  dailyTaskId: objectId,
});

export const bulkMoveSchema = z.object({
  questionIds: z.array(objectId).min(1, "questionIds must be a non-empty array").max(100),
  dailyTaskId: objectId,
});
