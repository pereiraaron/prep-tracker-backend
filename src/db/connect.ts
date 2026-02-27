import mongoose from "mongoose";
import { logger } from "../utils/logger";

export const connectToDB = async () => {
  try {
    mongoose.set("toJSON", {
      virtuals: true,
      versionKey: false,
      transform: (_doc: any, ret: any) => {
        delete ret._id;
      },
    });

    const uri = process.env.CONNECTION_STRING as string;
    await mongoose.connect(uri);
    logger.info("MongoDB connected");
  } catch (err) {
    logger.error("MongoDB connection error", { error: (err as Error).message });
    process.exit(1);
  }
};
