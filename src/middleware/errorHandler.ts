import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("Unhandled error", {
    message: err.message,
    stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
  });

  res.status(500).json({
    success: false,
    error: { message: "Internal server error" },
  });
};
