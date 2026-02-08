import { Document, Types } from "mongoose";

export interface ISubtype extends Document {
  name: string;
  description?: string;
  type: Types.ObjectId;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
