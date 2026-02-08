import mongoose from "mongoose"
import dotenv from "dotenv"

dotenv.config()

async function setup() {
  const uri = process.env.CONNECTION_STRING as string
  await mongoose.connect(uri)
  console.log("Connected to MongoDB Atlas")

  const db = mongoose.connection.db!

  const collections = ["types", "subtypes", "entries", "taskcompletions"]
  const existing = (await db.listCollections().toArray()).map((c) => c.name)

  for (const name of collections) {
    if (existing.includes(name)) {
      console.log("Already exists:", name)
    } else {
      await db.createCollection(name)
      console.log("Created:", name)
    }
  }

  // Create indexes matching the Mongoose models
  await db
    .collection("types")
    .createIndex({ userId: 1, name: 1 }, { unique: true })
  console.log("Index: types (userId + name, unique)")

  await db
    .collection("subtypes")
    .createIndex({ userId: 1, type: 1, name: 1 }, { unique: true })
  console.log("Index: subtypes (userId + type + name, unique)")

  await db.collection("entries").createIndex({ userId: 1 })
  await db.collection("entries").createIndex({ userId: 1, type: 1 })
  await db.collection("entries").createIndex({ userId: 1, status: 1 })
  await db.collection("entries").createIndex({ userId: 1, deadline: 1 })
  await db.collection("entries").createIndex({ userId: 1, isRecurring: 1 })
  console.log("Indexes: entries (5 indexes)")

  await db
    .collection("taskcompletions")
    .createIndex({ entry: 1, userId: 1, date: 1 }, { unique: true })
  await db.collection("taskcompletions").createIndex({ userId: 1, date: 1 })
  console.log("Indexes: taskcompletions (2 indexes)")

  const final = (await db.listCollections().toArray()).map((c) => c.name)
  console.log("\nAll collections:", final)

  await mongoose.disconnect()
  console.log("Done.")
}

setup().catch((err) => {
  console.error(err)
  process.exit(1)
})
