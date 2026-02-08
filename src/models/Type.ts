import { Schema, model } from "mongoose";
import { IType, FieldType } from "../types";

const fieldDefinitionSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    fieldType: {
      type: String,
      enum: Object.values(FieldType),
      required: true,
    },
    required: { type: Boolean, default: false },
    options: { type: [String] },
    defaultValue: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const typeSchema = new Schema<IType>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    fields: {
      type: [fieldDefinitionSchema],
      default: [],
    },
    userId: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

typeSchema.index({ userId: 1, name: 1 }, { unique: true });

export const Type = model("Type", typeSchema);
