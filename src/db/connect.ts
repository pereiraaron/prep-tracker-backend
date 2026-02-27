import mongoose from "mongoose";
import { logger } from "../utils/logger";

let connectionPromise: Promise<void> | null = null;

export const connectToDB = () => {
  if (connectionPromise) return connectionPromise;

  mongoose.set("toJSON", {
    virtuals: true,
    versionKey: false,
    transform: (_doc: any, ret: any) => {
      delete ret._id;
    },
  });

  connectionPromise = mongoose
    .connect(process.env.CONNECTION_STRING as string)
    .then(() => logger.info("MongoDB connected"))
    .catch((err) => {
      connectionPromise = null;
      logger.error("MongoDB connection error", { error: (err as Error).message });
      throw err;
    });

  return connectionPromise;
};
