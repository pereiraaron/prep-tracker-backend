import { Router } from "express";
import { authenticate } from "../middleware";
import { validate } from "../middleware/validate";
import {
  createQuestionSchema,
  updateQuestionSchema,
  createBacklogQuestionSchema,
  bulkDeleteSchema,
} from "../validators/question";
import {
  createQuestion,
  getAllQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  solveQuestion,
  resetQuestion,
  toggleStarred,
  searchQuestions,
  bulkDeleteQuestions,
  createBacklogQuestion,
  getBacklogQuestions,
} from "../controllers/question";

const router = Router();

// Named endpoints (must be before /:id to avoid conflicts)
router.get("/search", authenticate, searchQuestions);
router.post("/bulk-delete", authenticate, validate(bulkDeleteSchema), bulkDeleteQuestions);
router
  .route("/backlog")
  .get(authenticate, getBacklogQuestions)
  .post(authenticate, validate(createBacklogQuestionSchema), createBacklogQuestion);

router.route("/").get(authenticate, getAllQuestions).post(authenticate, validate(createQuestionSchema), createQuestion);

router.patch("/:id/solve", authenticate, solveQuestion);
router.patch("/:id/reset", authenticate, resetQuestion);
router.patch("/:id/star", authenticate, toggleStarred);

router
  .route("/:id")
  .get(authenticate, getQuestionById)
  .put(authenticate, validate(updateQuestionSchema), updateQuestion)
  .delete(authenticate, deleteQuestion);

export default router;
