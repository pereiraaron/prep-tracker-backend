import { Schema, model, Document } from "mongoose";

export interface ISubmission extends Document {
  userId: string;
  questionId: string;
  files: Map<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const submissionSchema = new Schema<ISubmission>(
  {
    userId: { type: String, required: true },
    questionId: { type: String, required: true },
    files: { type: Map, of: String, required: true },
  },
  { timestamps: true }
);

submissionSchema.index({ userId: 1, questionId: 1 }, { unique: true });

export const Submission = model("Submission", submissionSchema);
