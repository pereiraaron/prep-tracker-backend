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

/** Stale indexes from older setups — drop if present. */
const STALE_INDEX_NAMES = [
  "userId_1_status_1",
  "userId_1_starred_1",
  "userId_1_topic_1",
  // Old text index weighted `topic` instead of `topics`
  "question_text_search",
];

async function setup() {
  const uri = process.env.CONNECTION_STRING as string;
  await mongoose.connect(uri);
  console.log("Connected to MongoDB Atlas");

  const db = mongoose.connection.db!;
  const existing = (await db.listCollections().toArray()).map((c) => c.name);

  if (existing.includes("questions")) {
    console.log("Already exists: questions");
  } else {
    await db.createCollection("questions");
    console.log("Created: questions");
  }

  const questions = db.collection("questions");
  const current = await questions.indexes();
  const currentNames = new Set(current.map((i) => i.name));

  for (const name of STALE_INDEX_NAMES) {
    if (currentNames.has(name)) {
      await questions.dropIndex(name);
      console.log("Dropped stale index:", name);
    }
  }

  for (const { keys, options } of QUESTION_INDEXES) {
    await questions.createIndex(keys, options);
  }
  console.log(`Indexes: questions (${QUESTION_INDEXES.length} ensured)`);

  console.log("Done.");
  await mongoose.disconnect();
}

setup().catch((err) => {
  console.error(err);
  process.exit(1);
});
