import { Schema, model } from "mongoose";
import { IDailyTask, DailyTaskStatus } from "../types/dailyTask";

const dailyTaskSchema = new Schema<IDailyTask>(
  {
    task: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    taskName: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    targetQuestionCount: {
      type: Number,
      required: true,
    },
    addedQuestionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    solvedQuestionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: Object.values(DailyTaskStatus),
      default: DailyTaskStatus.Pending,
    },
  },
  {
    timestamps: true,
  }
);

dailyTaskSchema.index({ task: 1, userId: 1, date: 1 }, { unique: true });
dailyTaskSchema.index({ userId: 1, date: 1 });
dailyTaskSchema.index({ userId: 1, status: 1 });

export const DailyTask = model("DailyTask", dailyTaskSchema, "taskinstances");
