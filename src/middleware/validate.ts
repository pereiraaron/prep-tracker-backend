import { Request, Response, NextFunction } from "express";
import { z } from "zod";

export const validate =
  (schema: z.ZodType, source: "body" | "query" | "params" = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const messages = result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`);
      res.status(400).json({
        success: false,
        error: { message: "Validation failed", details: messages },
      });
      return;
    }
    req[source] = result.data;
    next();
  };
