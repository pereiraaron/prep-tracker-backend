import { z } from "zod";
import { Difficulty, QuestionSource } from "../types/question";
import { PrepCategory, SOLUTION_OPTIONAL_CATEGORIES } from "../types/category";
import { hasSolutionContent } from "../utils/solution";
import { normalizeCompanyTags } from "../utils/companyTags";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId");

const lowercaseArray = z.array(z.string().max(50).transform((s) => s.toLowerCase())).max(20);

const companyTagsArray = z
  .array(z.string().trim().max(50))
  .max(20)
  .transform(normalizeCompanyTags);

const solutionItemSchema = z.object({
  label: z.string().trim().max(100).optional(),
  content: z.string().trim().min(1).max(50000),
});

const solutionsArraySchema = z.array(solutionItemSchema).max(10).optional();

export const createQuestionSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
  notes: z.string().max(50000).optional(),
  solutions: solutionsArraySchema,
  difficulty: z.enum(Difficulty).optional(),
  topics: lowercaseArray.optional(),
  source: z.enum(QuestionSource).optional(),
  url: z.url().max(2000).optional().or(z.literal("")),
  tags: z.array(z.string().max(50)).max(20).optional(),
  companyTags: companyTagsArray.optional(),
  category: z.enum(PrepCategory),
}).refine(
  (data) => SOLUTION_OPTIONAL_CATEGORIES.includes(data.category) || hasSolutionContent(data),
  { message: "Solution is required for this category", path: ["solutions"] },
);

export const updateQuestionSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  notes: z.string().max(50000).optional(),
  solutions: solutionsArraySchema,
  difficulty: z.enum(Difficulty).nullable().optional(),
  topics: lowercaseArray.nullable().optional(),
  source: z.enum(QuestionSource).nullable().optional(),
  url: z.url().max(2000).optional().or(z.literal("")).nullable(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  companyTags: companyTagsArray.nullable().optional(),
  category: z.enum(PrepCategory).nullable().optional(),
});

export const createBacklogQuestionSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
  notes: z.string().max(50000).optional(),
  solutions: solutionsArraySchema,
  difficulty: z.enum(Difficulty).optional(),
  topics: lowercaseArray.optional(),
  source: z.enum(QuestionSource).optional(),
  url: z.url("URL is required").max(2000),
  tags: z.array(z.string().max(50)).max(20).optional(),
  companyTags: companyTagsArray.optional(),
  category: z.enum(PrepCategory),
});

export const solveQuestionSchema = z.object({
  solutions: solutionsArraySchema,
});

export const bulkDeleteSchema = z.object({
  ids: z.array(objectId).min(1, "ids must be a non-empty array").max(100),
});
