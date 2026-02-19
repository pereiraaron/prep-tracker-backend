import { z } from "zod";
import { PrepCategory } from "../types/category";
import { RecurrenceFrequency } from "../types/task";

const recurrenceSchema = z.object({
  frequency: z.nativeEnum(RecurrenceFrequency),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  interval: z.number().int().min(1).optional(),
  startDate: z.string().datetime({ offset: true }).or(z.string().date()),
});

export const createTaskSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z.nativeEnum(PrepCategory),
  targetQuestionCount: z.number().int().min(1).max(100),
  isRecurring: z.boolean().optional().default(false),
  recurrence: recurrenceSchema.optional(),
  endDate: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
});

export const updateTaskSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  category: z.nativeEnum(PrepCategory).optional(),
  targetQuestionCount: z.number().int().min(1).max(100).optional(),
  isRecurring: z.boolean().optional(),
  recurrence: recurrenceSchema.optional(),
  endDate: z.string().datetime({ offset: true }).or(z.string().date()).nullable().optional(),
});
