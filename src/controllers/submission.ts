import { Response } from "express";
import { Question } from "../models/Question";
import { Submission } from "../models/Submission";
import { AuthRequest } from "../types/auth";
import { sendSuccess, sendError } from "../utils/response";
import { logger } from "../utils/logger";

/**
 * GET /api/questions/:id/templates
 * Returns starter template files for the playground.
 */
export const getTemplates = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const question = await Question.findOne(
      { _id: req.params.id, userId },
      { templates: 1 }
    ).lean();

    if (!question) {
      sendError(res, "Question not found", 404);
      return;
    }

    sendSuccess(res, question.templates || null);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching templates");
  }
};

/**
 * GET /api/questions/:id/submission
 * Returns user's saved code for this question.
 */
export const getSubmission = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const submission = await Submission.findOne({
      userId,
      questionId: req.params.id,
    }).lean();

    sendSuccess(res, submission ? { files: submission.files, updatedAt: submission.updatedAt } : null);
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error fetching submission");
  }
};

/**
 * PUT /api/questions/:id/submission
 * Saves/updates user's code for this question.
 */
export const saveSubmission = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { files } = req.body;

    const submission = await Submission.findOneAndUpdate(
      { userId, questionId: req.params.id },
      { $set: { files } },
      { new: true, upsert: true }
    ).lean();

    sendSuccess(res, { files: submission.files, updatedAt: submission.updatedAt });
  } catch (error) {
    logger.error((error as Error).message);
    sendError(res, "Error saving submission");
  }
};
