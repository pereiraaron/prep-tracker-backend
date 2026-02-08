import { Schema, model } from "mongoose";
import { IEntry, EntryStatus, RecurrenceFrequency } from "../types";

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
    status: {
      $type: String,
      enum: Object.values(EntryStatus),
      default: EntryStatus.Pending,
    },
    type: {
      $type: Schema.Types.ObjectId,
      ref: "Type",
      required: true,
    },
    subtype: {
      $type: Schema.Types.ObjectId,
      ref: "Subtype",
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
    metadata: {
      $type: Map,
      of: Schema.Types.Mixed,
      default: new Map(),
    },
  },
  {
    timestamps: true,
    typeKey: "$type",
  }
);

entrySchema.index({ userId: 1 });
entrySchema.index({ userId: 1, type: 1 });
entrySchema.index({ userId: 1, status: 1 });
entrySchema.index({ userId: 1, deadline: 1 });
entrySchema.index({ userId: 1, isRecurring: 1 });

export const Entry = model("Entry", entrySchema);
