import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

const isProd = process.env.NODE_ENV === "production";

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const isError = res.statusCode >= 400;

    // Prod: always log errors / slow requests; sample ~10% of the rest
    if (isProd && !isError && duration < 500 && Math.random() >= 0.1) return;

    logger.info("request", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });

  next();
};
