import { Schema, model } from "mongoose";
import { ITaskInstance, TaskInstanceStatus } from "../types/taskInstance";

const taskInstanceSchema = new Schema<ITaskInstance>(
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
    },
    solvedQuestionCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: Object.values(TaskInstanceStatus),
      default: TaskInstanceStatus.Pending,
    },
  },
  {
    timestamps: true,
  }
);

taskInstanceSchema.index({ task: 1, userId: 1, date: 1 }, { unique: true });
taskInstanceSchema.index({ userId: 1, date: 1 });
taskInstanceSchema.index({ userId: 1, status: 1 });

export const TaskInstance = model("TaskInstance", taskInstanceSchema);
