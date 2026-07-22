import { Router } from "express";
import { authenticate } from "../middleware";
import { validate } from "../middleware/validate";
import {
  createApplicationSchema,
  updateApplicationSchema,
  updateApplicationStatusSchema,
  reorderApplicationsSchema,
  bulkArchiveSchema,
} from "../validators/application";
import {
  createApplication,
  getAllApplications,
  getApplicationById,
  updateApplication,
  updateApplicationStatus,
  toggleApplicationStarred,
  reorderApplications,
  archiveApplication,
  restoreApplication,
  deleteApplication,
  bulkArchiveApplications,
} from "../controllers/application";

const router = Router();

router.post("/reorder", authenticate, validate(reorderApplicationsSchema), reorderApplications);
router.post("/bulk-archive", authenticate, validate(bulkArchiveSchema), bulkArchiveApplications);

router
  .route("/")
  .get(authenticate, getAllApplications)
  .post(authenticate, validate(createApplicationSchema), createApplication);

router.patch("/:id/status", authenticate, validate(updateApplicationStatusSchema), updateApplicationStatus);
router.patch("/:id/star", authenticate, toggleApplicationStarred);
router.patch("/:id/archive", authenticate, archiveApplication);
router.patch("/:id/restore", authenticate, restoreApplication);

router
  .route("/:id")
  .get(authenticate, getApplicationById)
  .put(authenticate, validate(updateApplicationSchema), updateApplication)
  .delete(authenticate, deleteApplication);

export default router;
