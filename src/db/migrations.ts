import mongoose from "mongoose";
import { Question } from "../models/Question";
import { logger } from "../utils/logger";

const questionsCollection = () => mongoose.connection.collection("questions");

/**
 * Lowercase all existing topics values in the database.
 * Run once by setting RUN_MIGRATIONS=topics_lowercase in .env.
 */
const lowercaseTopics = async () => {
  const result = await Question.updateMany(
    { topics: { $exists: true, $ne: [] } },
    [{ $set: { topics: { $map: { input: "$topics", as: "t", in: { $toLower: "$$t" } } } } }]
  );
  logger.info(`Migration topics_lowercase: updated ${result.modifiedCount} documents`);
};

/**
 * Split comma-separated topic strings into individual array elements and lowercase.
 * e.g. ["Arrays, Hash Map, DFS"] → ["arrays", "hash map", "dfs"]
 */
const splitTopicsCsv = async () => {
  const result = await Question.updateMany(
    { topics: { $elemMatch: { $regex: "," } } },
    [{
      $set: {
        topics: {
          $reduce: {
            input: "$topics",
            initialValue: [] as string[],
            in: {
              $concatArrays: [
                "$$value",
                { $map: { input: { $split: ["$$this", ","] }, as: "s", in: { $toLower: { $trim: { input: "$$s" } } } } },
              ],
            },
          },
        },
      },
    }],
  );
  logger.info(`Migration topics_split_csv: updated ${result.modifiedCount} documents`);
};

/**
 * Backfill solutions array from legacy solution string.
 * e.g. solution: "code..." → solutions: [{ content: "code..." }]
 */
const backfillSolutions = async () => {
  const result = await questionsCollection().updateMany(
    {
      solution: { $exists: true, $type: "string", $ne: "" },
      $or: [{ solutions: { $exists: false } }, { solutions: { $size: 0 } }],
    },
    [{ $set: { solutions: [{ content: "$solution" }] } }]
  );
  logger.info(`Migration solutions_backfill: updated ${result.modifiedCount} documents`);
};

/**
 * Remove legacy solution field after solutions_backfill has run.
 */
const removeSolutionField = async () => {
  const result = await questionsCollection().updateMany(
    { solution: { $exists: true } },
    { $unset: { solution: "" } }
  );
  logger.info(`Migration remove_solution_field: updated ${result.modifiedCount} documents`);
};

const MIGRATIONS: Record<string, () => Promise<void>> = {
  topics_lowercase: lowercaseTopics,
  topics_split_csv: splitTopicsCsv,
  solutions_backfill: backfillSolutions,
  remove_solution_field: removeSolutionField,
};

export const runMigrations = async () => {
  const keys = process.env.RUN_MIGRATIONS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (!keys?.length) return;

  for (const key of keys) {
    const fn = MIGRATIONS[key];
    if (!fn) {
      logger.warn(`Unknown migration: ${key}`);
      continue;
    }
    logger.info(`Running migration: ${key}`);
    await fn();
  }
};
