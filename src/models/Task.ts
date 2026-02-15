import { Schema, model } from "mongoose";
import { ITask, TaskStatus, RecurrenceFrequency } from "../types/task";
import { PrepCategory } from "../types/category";

const taskSchema = new Schema<ITask>(
  {
    name: {
      $type: String,
      required: true,
      trim: true,
    },
    userId: {
      $type: String,
      required: true,
    },
    category: {
      $type: String,
      enum: Object.values(PrepCategory),
      required: true,
    },
    targetQuestionCount: {
      $type: Number,
      required: true,
      min: 1,
    },
    isRecurring: {
      $type: Boolean,
      default: false,
    },
    recurrence: {
      frequency: {
        $type: String,
        enum: Object.values(RecurrenceFrequency),
      },
      daysOfWeek: {
        $type: [Number],
      },
      interval: {
        $type: Number,
      },
      startDate: {
        $type: Date,
      },
    },
    endDate: {
      $type: Date,
    },
    status: {
      $type: String,
      enum: Object.values(TaskStatus),
      default: TaskStatus.Active,
    },
  },
  {
    timestamps: true,
    typeKey: "$type",
  }
);

taskSchema.index({ userId: 1 });
taskSchema.index({ userId: 1, category: 1 });
taskSchema.index({ userId: 1, status: 1 });
taskSchema.index({ userId: 1, isRecurring: 1 });

export const Task = model("Task", taskSchema);
