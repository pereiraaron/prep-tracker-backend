import mongoose from "mongoose"
import dotenv from "dotenv"

dotenv.config()

async function setup() {
  const uri = process.env.CONNECTION_STRING as string
  await mongoose.connect(uri)
  console.log("Connected to MongoDB Atlas")

  const db = mongoose.connection.db!
  const existing = (await db.listCollections().toArray()).map((c) => c.name)

  const collections = ["entries", "taskcompletions"]
  for (const name of collections) {
    if (existing.includes(name)) {
      console.log("Already exists:", name)
    } else {
      await db.createCollection(name)
      console.log("Created:", name)
    }
  }

  // Entries indexes
  await db.collection("entries").createIndex({ userId: 1 })
  await db.collection("entries").createIndex({ userId: 1, category: 1 })
  await db.collection("entries").createIndex({ userId: 1, difficulty: 1 })
  await db.collection("entries").createIndex({ userId: 1, status: 1 })
  await db.collection("entries").createIndex({ userId: 1, deadline: 1 })
  await db.collection("entries").createIndex({ userId: 1, isRecurring: 1 })
  console.log("Indexes: entries (6)")

  // TaskCompletions indexes
  await db
    .collection("taskcompletions")
    .createIndex({ entry: 1, userId: 1, date: 1 }, { unique: true })
  await db.collection("taskcompletions").createIndex({ userId: 1, date: 1 })
  console.log("Indexes: taskcompletions (2)")

  console.log("Done.")
  await mongoose.disconnect()
}

setup().catch((err) => {
  console.error(err)
  process.exit(1)
})
