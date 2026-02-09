import { Router } from "express";
import { authenticate } from "../middleware";
import {
  getOverview,
  getCategoryBreakdown,
  getDifficultyBreakdown,
  getStreaks,
  getProgress,
} from "../controllers/stats";

const router = Router();

router.get("/overview", authenticate, getOverview);
router.get("/categories", authenticate, getCategoryBreakdown);
router.get("/difficulties", authenticate, getDifficultyBreakdown);
router.get("/streaks", authenticate, getStreaks);
router.get("/progress", authenticate, getProgress);

export default router;
