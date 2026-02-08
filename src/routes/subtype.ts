import { Router } from "express";
import { authenticate } from "../middleware";
import {
  createSubtype,
  getAllSubtypes,
  getSubtypeById,
  updateSubtype,
  deleteSubtype,
} from "../controllers";

const router = Router();

router.route("/").get(authenticate, getAllSubtypes).post(authenticate, createSubtype);

router
  .route("/:id")
  .get(authenticate, getSubtypeById)
  .put(authenticate, updateSubtype)
  .delete(authenticate, deleteSubtype);

export default router;
