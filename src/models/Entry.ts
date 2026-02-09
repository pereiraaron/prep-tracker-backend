import { Schema, model } from "mongoose";
import { IEntry, EntryStatus, RecurrenceFrequency, PrepCategory, Difficulty } from "../types";

const entrySchema = new Schema<IEntry>(
  {
    title: {
      $type: String,
      required: true,
      trim: true,
    },
    notes: {
      $type: String,
      trim: true,
    },
    solution: {
      $type: String,
      trim: true,
    },
    status: {
      $type: String,
      enum: Object.values(EntryStatus),
      default: EntryStatus.Pending,
    },
    category: {
      $type: String,
      enum: Object.values(PrepCategory),
      required: true,
    },
    topic: {
      $type: String,
      trim: true,
    },
    difficulty: {
      $type: String,
      enum: Object.values(Difficulty),
    },
    source: {
      $type: String,
      trim: true,
    },
    url: {
      $type: String,
      trim: true,
    },
    tags: {
      $type: [String],
      default: [],
    },
    userId: {
      $type: String,
      required: true,
    },
    deadline: {
      $type: Date,
      required: true,
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
    },
    recurringEndDate: {
      $type: Date,
    },
  },
  {
    timestamps: true,
    typeKey: "$type",
  }
);

entrySchema.index({ userId: 1 });
entrySchema.index({ userId: 1, category: 1 });
entrySchema.index({ userId: 1, difficulty: 1 });
entrySchema.index({ userId: 1, status: 1 });
entrySchema.index({ userId: 1, deadline: 1 });
entrySchema.index({ userId: 1, isRecurring: 1 });

export const Entry = model("Entry", entrySchema);
