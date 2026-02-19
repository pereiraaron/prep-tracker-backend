import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError, ZodIssue } from "zod";

export const validate =
  (schema: ZodSchema, source: "body" | "query" | "params" = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const messages = result.error.issues.map(
        (e: ZodIssue) => `${e.path.join(".")}: ${e.message}`
      );
      res.status(400).json({
        success: false,
        error: { message: "Validation failed", details: messages },
      });
      return;
    }
    req[source] = result.data;
    next();
  };
