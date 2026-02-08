import { Document, Types } from "mongoose";
import { EntryStatus } from "./entry";

export interface ITaskCompletion extends Document {
  entry: Types.ObjectId;
  userId: string;
  date: Date;
  status: EntryStatus;
  notes?: string;
  metadata?: Map<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
