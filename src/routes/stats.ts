import { Router } from "express";
import { authenticate } from "../middleware";
import {
  getOverview,
  getCategoryBreakdown,
  getDifficultyBreakdown,
  getTopicBreakdown,
  getSourceBreakdown,
  getCompanyTagBreakdown,
  getTagBreakdown,
  getProgress,
  getWeeklyProgress,
  getCumulativeProgress,
  getHeatmap,
  getDifficultyByCategory,
} from "../controllers/stats";

const router = Router();

router.get("/overview", authenticate, getOverview);
router.get("/categories", authenticate, getCategoryBreakdown);
router.get("/difficulties", authenticate, getDifficultyBreakdown);
router.get("/topics", authenticate, getTopicBreakdown);
router.get("/sources", authenticate, getSourceBreakdown);
router.get("/company-tags", authenticate, getCompanyTagBreakdown);
router.get("/tags", authenticate, getTagBreakdown);
router.get("/progress", authenticate, getProgress);
router.get("/weekly-progress", authenticate, getWeeklyProgress);
router.get("/cumulative-progress", authenticate, getCumulativeProgress);
router.get("/heatmap", authenticate, getHeatmap);
router.get("/difficulty-by-category", authenticate, getDifficultyByCategory);

export default router;
