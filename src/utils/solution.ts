import { ISolution } from "../types/question";
import { MULTIPLE_SOLUTION_CATEGORIES, PrepCategory } from "../types/category";

type SolutionInput = {
  solutions?: ISolution[];
};

export const hasMultipleSolutions = (data: SolutionInput): boolean =>
  (data.solutions?.length ?? 0) > 1;

export const allowsMultipleSolutions = (category: PrepCategory | null | undefined): boolean =>
  !!category && MULTIPLE_SOLUTION_CATEGORIES.includes(category);

export const getMultipleSolutionsError = (
  category: PrepCategory | null | undefined,
  data: SolutionInput
): string | null => {
  if (!hasMultipleSolutions(data)) return null;
  if (allowsMultipleSolutions(category)) return null;
  return "Multiple solutions are only allowed for DSA and Machine Coding categories";
};

export const hasSolutionContent = (data: SolutionInput): boolean =>
  !!data.solutions?.some((s) => s.content.trim().length > 0);

export const normalizeSolutions = (
  data: SolutionInput
): { solutions?: ISolution[] } => {
  if (!data.solutions?.length) return {};

  return {
    solutions: data.solutions.map((s) => ({
      ...(s.label ? { label: s.label.trim() } : {}),
      content: s.content.trim(),
    })),
  };
};
