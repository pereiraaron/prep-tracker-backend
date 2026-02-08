import { Schema, model } from "mongoose";
import { ITaskCompletion, EntryStatus } from "../types";

const taskCompletionSchema = new Schema<ITaskCompletion>(
  {
    entry: {
      type: Schema.Types.ObjectId,
      ref: "Entry",
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
    status: {
      type: String,
      enum: Object.values(EntryStatus),
      default: EntryStatus.Pending,
    },
    notes: {
      type: String,
      trim: true,
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: new Map(),
    },
  },
  {
    timestamps: true,
  }
);

taskCompletionSchema.index({ entry: 1, userId: 1, date: 1 }, { unique: true });
taskCompletionSchema.index({ userId: 1, date: 1 });

export const TaskCompletion = model("TaskCompletion", taskCompletionSchema);
