import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

/** Keep in sync with src/models/Question.ts */
const QUESTION_INDEXES: Array<{
  keys: Record<string, 1 | -1 | "text">;
  options?: Record<string, unknown>;
}> = [
  { keys: { userId: 1, category: 1 } },
  { keys: { userId: 1, solvedAt: 1 } },
  { keys: { userId: 1, topics: 1 } },
  { keys: { userId: 1, difficulty: 1 } },
  { keys: { userId: 1, source: 1 } },
  { keys: { userId: 1, tags: 1 } },
  { keys: { userId: 1, companyTags: 1 } },
  { keys: { userId: 1, status: 1, category: 1 } },
  { keys: { userId: 1, status: 1, solvedAt: 1 } },
  { keys: { userId: 1, status: 1, createdAt: -1 } },
  { keys: { userId: 1, status: 1, updatedAt: -1 } },
  { keys: { userId: 1, status: 1, title: 1 } },
  { keys: { userId: 1, status: 1, starred: 1, createdAt: -1 } },
  {
    keys: { title: "text", topics: "text", tags: "text", companyTags: "text" },
    options: { name: "question_text_search" },
  },
];

/** Keep in sync with src/models/Application.ts */
const APPLICATION_INDEXES: Array<{
  keys: Record<string, 1 | -1 | "text">;
  options?: Record<string, unknown>;
}> = [
  { keys: { userId: 1, status: 1, priority: 1, updatedAt: -1 } },
  { keys: { userId: 1, company: 1 } },
  { keys: { userId: 1, starred: 1, updatedAt: -1 } },
  { keys: { userId: 1, archivedAt: 1, priority: 1 } },
  { keys: { userId: 1, archivedAt: 1, status: 1, updatedAt: -1 } },
];

/** Keep in sync with src/models/Interview.ts */
const INTERVIEW_INDEXES: Array<{
  keys: Record<string, 1 | -1 | "text">;
  options?: Record<string, unknown>;
}> = [
  { keys: { userId: 1, scheduledAt: 1 } },
  { keys: { userId: 1, applicationId: 1, round: 1 } },
  { keys: { userId: 1, status: 1, scheduledAt: 1 } },
  { keys: { userId: 1, company: 1, scheduledAt: 1 } },
  { keys: { userId: 1, loopId: 1 } },
  { keys: { userId: 1, applicationId: 1, status: 1 } },
];

/** Stale indexes from older setups — drop if present. */
const STALE_INDEX_NAMES = [
  "userId_1_status_1",
  "userId_1_starred_1",
  "userId_1_topic_1",
  // Old text index weighted `topic` instead of `topics`
  "question_text_search",
];

async function ensureCollection(
  db: mongoose.mongo.Db,
  name: string,
  existing: string[]
) {
  if (existing.includes(name)) {
    console.log(`Already exists: ${name}`);
  } else {
    await db.createCollection(name);
    console.log(`Created: ${name}`);
  }
}

async function ensureIndexes(
  collection: mongoose.mongo.Collection,
  indexes: Array<{ keys: Record<string, 1 | -1 | "text">; options?: Record<string, unknown> }>,
  label: string,
  staleNames: string[] = []
) {
  const current = await collection.indexes();
  const currentNames = new Set(current.map((i) => i.name));

  for (const name of staleNames) {
    if (currentNames.has(name)) {
      await collection.dropIndex(name);
      console.log("Dropped stale index:", name);
    }
  }

  for (const { keys, options } of indexes) {
    await collection.createIndex(keys, options);
  }
  console.log(`Indexes: ${label} (${indexes.length} ensured)`);
}

async function setup() {
  const uri = process.env.CONNECTION_STRING as string;
  await mongoose.connect(uri);
  console.log("Connected to MongoDB Atlas");

  const db = mongoose.connection.db!;
  const existing = (await db.listCollections().toArray()).map((c) => c.name);

  await ensureCollection(db, "questions", existing);
  await ensureCollection(db, "applications", existing);
  await ensureCollection(db, "interviews", existing);

  await ensureIndexes(db.collection("questions"), QUESTION_INDEXES, "questions", STALE_INDEX_NAMES);
  await ensureIndexes(db.collection("applications"), APPLICATION_INDEXES, "applications");
  await ensureIndexes(db.collection("interviews"), INTERVIEW_INDEXES, "interviews");

  console.log("Done.");
  await mongoose.disconnect();
}

setup().catch((err) => {
  console.error(err);
  process.exit(1);
});
