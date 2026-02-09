import { Router } from "express";
import { PREP_CATEGORIES } from "../types";

const router = Router();

router.get("/", (_, res) => {
  res.status(200).json(PREP_CATEGORIES);
});

export default router;
