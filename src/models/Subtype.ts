import { Schema, model } from "mongoose";
import { ISubtype } from "../types";

const subtypeSchema = new Schema<ISubtype>(
  {
    name: {
      $type: String,
      required: true,
      trim: true,
    },
    description: {
      $type: String,
      trim: true,
    },
    type: {
      $type: Schema.Types.ObjectId,
      ref: "Type",
      required: true,
    },
    userId: {
      $type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    typeKey: "$type",
  }
);

subtypeSchema.index({ userId: 1, type: 1, name: 1 }, { unique: true });

export const Subtype = model("Subtype", subtypeSchema);
