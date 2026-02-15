import mongoose from "mongoose"
import dotenv from "dotenv"

dotenv.config()

/**
 * Migrates data from the old Entry/TaskCompletion schema
 * to the new Task/TaskInstance/Question schema.
 *
 * For each old Entry, creates:
 *   - 1 Task
 *   - 1 TaskInstance (for the entry's deadline date)
 *   - 1 Question (the entry itself becomes a question)
 *
 * For each old TaskCompletion on a different date, creates:
 *   - 1 additional TaskInstance + Question for that date
 */
async function migrate() {
  const uri = process.env.CONNECTION_STRING as string
  await mongoose.connect(uri)
  console.log("Connected to MongoDB Atlas")

  const db = mongoose.connection.db!

  // Check if old collections exist
  const existing = (await db.listCollections().toArray()).map((c) => c.name)
  if (!existing.includes("entries")) {
    console.log("No 'entries' collection found. Nothing to migrate.")
    await mongoose.disconnect()
    return
  }

  const entries = await db.collection("entries").find({}).toArray()
  const completions = await db.collection("taskcompletions").find({}).toArray()

  console.log(`Found ${entries.length} entries and ${completions.length} completions`)

  if (entries.length === 0) {
    console.log("No entries to migrate.")
    await mongoose.disconnect()
    return
  }

  // Ensure new collections exist
  for (const name of ["tasks", "taskinstances", "questions"]) {
    if (!existing.includes(name)) {
      await db.createCollection(name)
      console.log("Created collection:", name)
    }
  }

  const entryToTaskMap = new Map<string, { taskId: any; instanceId: any }>()

  // Phase 1: Migrate entries → Tasks + TaskInstances + Questions
  for (const entry of entries) {
    const recurrence = entry.recurrence
      ? {
          frequency: entry.recurrence.frequency || "daily",
          daysOfWeek: entry.recurrence.daysOfWeek || [],
          startDate: entry.deadline,
        }
      : {
          frequency: "daily" as const,
          startDate: entry.deadline || new Date(),
        }

    // Create Task
    const taskDoc = {
      name: entry.title,
      userId: entry.userId,
      category: entry.category,
      targetQuestionCount: 1,
      isRecurring: entry.isRecurring || false,
      recurrence: entry.isRecurring ? recurrence : undefined,
      endDate: entry.recurringEndDate || undefined,
      status: entry.status === "completed" ? "completed" : "active",
      createdAt: entry.createdAt || new Date(),
      updatedAt: entry.updatedAt || new Date(),
    }

    const taskResult = await db.collection("tasks").insertOne(taskDoc)

    // Create TaskInstance for the entry's deadline date
    const instanceDate = new Date(entry.deadline || new Date())
    instanceDate.setHours(0, 0, 0, 0)

    const statusMap: Record<string, string> = {
      completed: "completed",
      in_progress: "in_progress",
      pending: "pending",
    }

    const instanceDoc = {
      task: taskResult.insertedId,
      userId: entry.userId,
      date: instanceDate,
      taskName: entry.title,
      category: entry.category,
      targetQuestionCount: 1,
      addedQuestionCount: 1,
      solvedQuestionCount: entry.status === "completed" ? 1 : 0,
      status: statusMap[entry.status] || "pending",
      createdAt: entry.createdAt || new Date(),
      updatedAt: entry.updatedAt || new Date(),
    }

    const instanceResult = await db.collection("taskinstances").insertOne(instanceDoc)

    // Create Question from the entry content
    const questionDoc = {
      taskInstance: instanceResult.insertedId,
      task: taskResult.insertedId,
      userId: entry.userId,
      title: entry.title,
      notes: entry.notes || undefined,
      solution: entry.solution || undefined,
      status: entry.status === "completed" ? "solved" : entry.status,
      difficulty: entry.difficulty || undefined,
      topic: entry.topic || undefined,
      source: entry.source || undefined,
      url: entry.url || undefined,
      tags: entry.tags || [],
      solvedAt: entry.status === "completed" ? (entry.updatedAt || new Date()) : undefined,
      createdAt: entry.createdAt || new Date(),
      updatedAt: entry.updatedAt || new Date(),
    }

    await db.collection("questions").insertOne(questionDoc)

    entryToTaskMap.set(entry._id.toString(), {
      taskId: taskResult.insertedId,
      instanceId: instanceResult.insertedId,
    })
  }

  console.log(`Migrated ${entries.length} entries to tasks/instances/questions`)

  // Phase 2: Migrate completions on different dates
  let additionalInstances = 0
  for (const completion of completions) {
    const mapping = entryToTaskMap.get(completion.entry.toString())
    if (!mapping) continue

    const completionDate = new Date(completion.date)
    completionDate.setHours(0, 0, 0, 0)

    // Check if instance already exists for this task+date
    const existingInstance = await db.collection("taskinstances").findOne({
      task: mapping.taskId,
      userId: completion.userId,
      date: completionDate,
    })

    if (existingInstance) continue // Already covered by the entry migration

    const origEntry = entries.find((e) => e._id.toString() === completion.entry.toString())
    if (!origEntry) continue

    const newInstance = {
      task: mapping.taskId,
      userId: completion.userId,
      date: completionDate,
      taskName: origEntry.title,
      category: origEntry.category,
      targetQuestionCount: 1,
      addedQuestionCount: 1,
      solvedQuestionCount: completion.status === "completed" ? 1 : 0,
      status: completion.status === "completed" ? "completed" : (completion.status || "pending"),
      createdAt: completion.createdAt || new Date(),
      updatedAt: completion.updatedAt || new Date(),
    }

    const instResult = await db.collection("taskinstances").insertOne(newInstance)

    await db.collection("questions").insertOne({
      taskInstance: instResult.insertedId,
      task: mapping.taskId,
      userId: completion.userId,
      title: origEntry.title,
      notes: completion.notes || origEntry.notes || undefined,
      solution: origEntry.solution || undefined,
      status: completion.status === "completed" ? "solved" : (completion.status || "pending"),
      difficulty: origEntry.difficulty || undefined,
      topic: origEntry.topic || undefined,
      source: origEntry.source || undefined,
      url: origEntry.url || undefined,
      tags: origEntry.tags || [],
      solvedAt: completion.status === "completed" ? (completion.updatedAt || new Date()) : undefined,
      createdAt: completion.createdAt || new Date(),
      updatedAt: completion.updatedAt || new Date(),
    })

    additionalInstances++
  }

  console.log(`Created ${additionalInstances} additional instances from completions`)

  // Phase 3: Verify
  const taskCount = await db.collection("tasks").countDocuments()
  const instanceCount = await db.collection("taskinstances").countDocuments()
  const questionCount = await db.collection("questions").countDocuments()

  console.log(`\nMigration complete:`)
  console.log(`  Tasks:          ${taskCount}`)
  console.log(`  Task Instances: ${instanceCount}`)
  console.log(`  Questions:      ${questionCount}`)
  console.log(`  (Original: ${entries.length} entries, ${completions.length} completions)`)

  await mongoose.disconnect()
}

migrate().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
