import { Question } from "../models/Question";
import { logger } from "../utils/logger";

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

const MIGRATIONS: Record<string, () => Promise<void>> = {
  topics_lowercase: lowercaseTopics,
  topics_split_csv: splitTopicsCsv,
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
