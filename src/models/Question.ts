import { Schema, model } from "mongoose";
import { IQuestion, QuestionStatus, Difficulty, QuestionSource } from "../types/question";

const revisionSchema = new Schema(
  {
    notes: { $type: String },
    solution: { $type: String },
    editedAt: { $type: Date, required: true },
  },
  { _id: false, typeKey: "$type" }
);

const questionSchema = new Schema<IQuestion>(
  {
    dailyTask: {
      $type: Schema.Types.ObjectId,
      ref: "DailyTask",
      default: null,
    },
    task: {
      $type: Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
    userId: {
      $type: String,
      required: true,
    },
    title: {
      $type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    notes: {
      $type: String,
      trim: true,
      maxlength: 50000,
    },
    solution: {
      $type: String,
      trim: true,
      maxlength: 50000,
    },
    status: {
      $type: String,
      enum: Object.values(QuestionStatus),
      default: QuestionStatus.Pending,
    },
    difficulty: {
      $type: String,
      enum: Object.values(Difficulty),
    },
    topic: {
      $type: String,
      trim: true,
      maxlength: 100,
    },
    source: {
      $type: String,
      enum: Object.values(QuestionSource),
    },
    url: {
      $type: String,
      trim: true,
      maxlength: 2000,
    },
    tags: {
      $type: [String],
      default: [],
      validate: [(v: string[]) => v.length <= 20, "Cannot have more than 20 tags"],
    },
    starred: {
      $type: Boolean,
      default: false,
    },
    revisions: {
      $type: [revisionSchema],
      default: [],
    },
    reviewCount: {
      $type: Number,
      default: 0,
      min: 0,
    },
    nextReviewAt: {
      $type: Date,
    },
    lastReviewedAt: {
      $type: Date,
    },
    solvedAt: {
      $type: Date,
    },
    deletedAt: {
      $type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    typeKey: "$type",
  }
);

// Soft-delete filter: exclude deleted questions from all queries by default
questionSchema.pre("find", function () {
  if (!this.getFilter().deletedAt) this.where({ deletedAt: null });
});
questionSchema.pre("findOne", function () {
  if (!this.getFilter().deletedAt) this.where({ deletedAt: null });
});
questionSchema.pre("countDocuments", function () {
  if (!this.getFilter().deletedAt) this.where({ deletedAt: null });
});
questionSchema.pre("aggregate", function () {
  const pipeline = this.pipeline();
  if (pipeline.length > 0 && "$match" in pipeline[0]) {
    const match = (pipeline[0] as { $match: Record<string, any> }).$match;
    if (!match.deletedAt) match.deletedAt = null;
  } else {
    pipeline.unshift({ $match: { deletedAt: null } });
  }
});

questionSchema.index({ dailyTask: 1 });
questionSchema.index({ task: 1, userId: 1 });
questionSchema.index({ userId: 1, status: 1 });
questionSchema.index({ userId: 1, solvedAt: 1 });
questionSchema.index({ userId: 1, starred: 1 });
questionSchema.index({ userId: 1, topic: 1 });
questionSchema.index({ userId: 1, nextReviewAt: 1 });
questionSchema.index({ deletedAt: 1 });

export const Question = model("Question", questionSchema);
