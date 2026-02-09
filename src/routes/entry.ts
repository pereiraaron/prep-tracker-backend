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
  searchEntries,
  getAllTags,
  getAllTopics,
  getAllSources,
  bulkDeleteEntries,
} from "../controllers";

const router = Router();

// Named endpoints (must be before /:id to avoid conflicts)
router.get("/today", authenticate, getToday);
router.get("/history", authenticate, getHistory);
router.get("/search", authenticate, searchEntries);
router.get("/tags", authenticate, getAllTags);
router.get("/topics", authenticate, getAllTopics);
router.get("/sources", authenticate, getAllSources);
router.post("/status", authenticate, updateTaskStatus);
router.post("/bulk-delete", authenticate, bulkDeleteEntries);

router.route("/").get(authenticate, getAllEntries).post(authenticate, createEntry);

router
  .route("/:id")
  .get(authenticate, getEntryById)
  .put(authenticate, updateEntry)
  .delete(authenticate, deleteEntry);

export default router;
