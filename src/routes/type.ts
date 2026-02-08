import { Router } from "express";
import { authenticate } from "../middleware";
import {
  createType,
  getAllTypes,
  getTypeById,
  updateType,
  deleteType,
} from "../controllers";

const router = Router();

router.route("/").get(authenticate, getAllTypes).post(authenticate, createType);

router
  .route("/:id")
  .get(authenticate, getTypeById)
  .put(authenticate, updateType)
  .delete(authenticate, deleteType);

export default router;
