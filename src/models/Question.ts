import { Schema, model } from "mongoose";
import { IQuestion, QuestionStatus, Difficulty, QuestionSource } from "../types/question";
import { PrepCategory } from "../types/category";

const questionSchema = new Schema<IQuestion>(
  {
    userId: {
      $type: String,
      required: true,
    },
    category: {
      $type: String,
      enum: [...Object.values(PrepCategory), null],
      default: null,
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
    companyTags: {
      $type: [String],
      default: [],
      validate: [(v: string[]) => v.length <= 20, "Cannot have more than 20 company tags"],
    },
    starred: {
      $type: Boolean,
      default: false,
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

questionSchema.index({ userId: 1, category: 1 });
questionSchema.index({ userId: 1, status: 1 });
questionSchema.index({ userId: 1, solvedAt: 1 });
questionSchema.index({ userId: 1, starred: 1 });
questionSchema.index({ userId: 1, topic: 1 });

export const Question = model("Question", questionSchema);
