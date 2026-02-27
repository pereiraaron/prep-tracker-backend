import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function setup() {
  const uri = process.env.CONNECTION_STRING as string;
  await mongoose.connect(uri);
  console.log("Connected to MongoDB Atlas");

  const db = mongoose.connection.db!;
  const existing = (await db.listCollections().toArray()).map((c) => c.name);

  const collections = ["questions"];
  for (const name of collections) {
    if (existing.includes(name)) {
      console.log("Already exists:", name);
    } else {
      await db.createCollection(name);
      console.log("Created:", name);
    }
  }

  // Questions indexes
  await db.collection("questions").createIndex({ userId: 1, category: 1 });
  await db.collection("questions").createIndex({ userId: 1, status: 1 });
  await db.collection("questions").createIndex({ userId: 1, solvedAt: 1 });
  await db.collection("questions").createIndex({ userId: 1, starred: 1 });
  await db.collection("questions").createIndex({ userId: 1, topic: 1 });
  console.log("Indexes: questions (5)");

  console.log("Done.");
  await mongoose.disconnect();
}

setup().catch((err) => {
  console.error(err);
  process.exit(1);
});
