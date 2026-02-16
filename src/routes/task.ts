import { Router } from "express";
import { authenticate } from "../middleware";
import {
  createTask,
  getAllTasks,
  getTaskById,
  updateTask,
  deleteTask,
  getToday,
  getHistory,
  getDailyTaskById,
} from "../controllers/task";

const router = Router();

// Named endpoints (must be before /:id to avoid conflicts)
router.get("/today", authenticate, getToday);
router.get("/history", authenticate, getHistory);
router.get("/daily/:id", authenticate, getDailyTaskById);

router.route("/").get(authenticate, getAllTasks).post(authenticate, createTask);

router
  .route("/:id")
  .get(authenticate, getTaskById)
  .put(authenticate, updateTask)
  .delete(authenticate, deleteTask);

export default router;
