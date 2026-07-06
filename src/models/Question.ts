import { Schema, model } from "mongoose";
import { IQuestion, ISolution, QuestionStatus, Difficulty, QuestionSource } from "../types/question";
import { PrepCategory } from "../types/category";

const solutionSchema = new Schema<ISolution>(
  {
    label: {
      $type: String,
      trim: true,
      maxlength: 100,
    },
    content: {
      $type: String,
      trim: true,
      required: true,
      maxlength: 50000,
    },
  },
  { _id: true, typeKey: "$type" }
);

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
    solutions: {
      $type: [solutionSchema],
      default: [],
      validate: [(v: ISolution[]) => v.length <= 10, "Cannot have more than 10 solutions"],
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
    topics: {
      $type: [String],
      default: [],
      validate: [(v: string[]) => v.length <= 20, "Cannot have more than 20 topics"],
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
    templates: {
      $type: Map,
      of: String,
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
questionSchema.index({ userId: 1, topics: 1 });
questionSchema.index({ userId: 1, difficulty: 1 });
questionSchema.index({ userId: 1, source: 1 });
questionSchema.index({ userId: 1, tags: 1 });
questionSchema.index({ userId: 1, companyTags: 1 });
questionSchema.index({ userId: 1, status: 1, category: 1 });
questionSchema.index({ userId: 1, status: 1, solvedAt: 1 });
questionSchema.index({ userId: 1, status: 1, createdAt: -1 });
questionSchema.index(
  { title: "text", topics: "text", tags: "text", companyTags: "text" },
  { name: "question_text_search" }
);

export const Question = model("Question", questionSchema);
