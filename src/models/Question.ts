import { Schema, model } from "mongoose";
import { IQuestion, QuestionStatus, Difficulty, QuestionSource } from "../types/question";

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
    },
    source: {
      $type: String,
      enum: Object.values(QuestionSource),
    },
    url: {
      $type: String,
      trim: true,
    },
    tags: {
      $type: [String],
      default: [],
    },
    solvedAt: {
      $type: Date,
    },
  },
  {
    timestamps: true,
    typeKey: "$type",
  }
);

questionSchema.index({ dailyTask: 1 });
questionSchema.index({ task: 1, userId: 1 });
questionSchema.index({ userId: 1, status: 1 });
questionSchema.index({ userId: 1, solvedAt: 1 });
questionSchema.index({ userId: 1, dailyTask: 1 });

export const Question = model("Question", questionSchema);
