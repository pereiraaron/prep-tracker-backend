import { Router } from "express";
import { authenticate } from "../middleware";
import {
  createQuestion,
  getAllQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  solveQuestion,
  searchQuestions,
  getAllTags,
  getAllTopics,
  getAllSources,
  bulkDeleteQuestions,
  createBacklogQuestion,
  getBacklogQuestions,
  moveToDailyTask,
  bulkMoveToDailyTask,
} from "../controllers/question";

const router = Router();

// Named endpoints (must be before /:id to avoid conflicts)
router.get("/search", authenticate, searchQuestions);
router.get("/tags", authenticate, getAllTags);
router.get("/topics", authenticate, getAllTopics);
router.get("/sources", authenticate, getAllSources);
router.post("/bulk-delete", authenticate, bulkDeleteQuestions);
router.post("/bulk-move", authenticate, bulkMoveToDailyTask);
router.route("/backlog")
  .get(authenticate, getBacklogQuestions)
  .post(authenticate, createBacklogQuestion);

router.route("/").get(authenticate, getAllQuestions).post(authenticate, createQuestion);

router.patch("/:id/solve", authenticate, solveQuestion);
router.patch("/:id/move", authenticate, moveToDailyTask);

router
  .route("/:id")
  .get(authenticate, getQuestionById)
  .put(authenticate, updateQuestion)
  .delete(authenticate, deleteQuestion);

export default router;
