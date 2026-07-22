import { Router } from "express";
import { authenticate } from "../middleware";
import { validate } from "../middleware/validate";
import {
  createInterviewSchema,
  updateInterviewSchema,
  completeInterviewSchema,
  setInterviewOutcomeSchema,
  rescheduleInterviewSchema,
  createInterviewLoopSchema,
} from "../validators/interview";
import {
  createInterview,
  getAllInterviews,
  getInterviewById,
  updateInterview,
  completeInterview,
  setInterviewOutcome,
  rescheduleInterview,
  deleteInterview,
  createInterviewLoop,
} from "../controllers/interview";

const router = Router();

router.post("/loop", authenticate, validate(createInterviewLoopSchema), createInterviewLoop);

router
  .route("/")
  .get(authenticate, getAllInterviews)
  .post(authenticate, validate(createInterviewSchema), createInterview);

router.patch("/:id/complete", authenticate, validate(completeInterviewSchema), completeInterview);
router.patch("/:id/outcome", authenticate, validate(setInterviewOutcomeSchema), setInterviewOutcome);
router.patch("/:id/reschedule", authenticate, validate(rescheduleInterviewSchema), rescheduleInterview);

router
  .route("/:id")
  .get(authenticate, getInterviewById)
  .put(authenticate, validate(updateInterviewSchema), updateInterview)
  .delete(authenticate, deleteInterview);

export default router;
