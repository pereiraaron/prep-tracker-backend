import { Router } from "express";
import { authenticate } from "../middleware";
import {
  createEntry,
  getAllEntries,
  getEntryById,
  updateEntry,
  deleteEntry,
  getToday,
  getHistory,
  updateTaskStatus,
} from "../controllers";

const router = Router();

// Scheduling endpoints (must be before /:id to avoid conflicts)
router.get("/today", authenticate, getToday);
router.get("/history", authenticate, getHistory);
router.post("/status", authenticate, updateTaskStatus);

router.route("/").get(authenticate, getAllEntries).post(authenticate, createEntry);

router
  .route("/:id")
  .get(authenticate, getEntryById)
  .put(authenticate, updateEntry)
  .delete(authenticate, deleteEntry);

export default router;
