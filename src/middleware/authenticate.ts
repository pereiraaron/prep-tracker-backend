import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthRequest, JwtPayload } from "../types";

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader =
    req.headers.authorization || (req.headers.Authorization as string);

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing or invalid token" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Token expired or invalid" });
  }
};
