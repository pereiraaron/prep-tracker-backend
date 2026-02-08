import { Response } from "express";
import { Subtype } from "../models";
import { AuthRequest } from "../types";

export const createSubtype = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, description, type } = req.body;

    const subtype = await Subtype.create({ name, description, type, userId });

    res.status(201).json(subtype);
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(400).json({ message: "A subtype with this name already exists for this type" });
      return;
    }
    res.status(500).json({ message: "Error creating subtype", error });
  }
};

export const getAllSubtypes = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const filter: Record<string, string | undefined> = { userId };
    if (req.query.type) {
      filter.type = req.query.type as string;
    }

    const subtypes = await Subtype.find(filter)
      .populate("type", "name")
      .sort({ createdAt: -1 });

    res.status(200).json(subtypes);
  } catch (error) {
    res.status(500).json({ message: "Error fetching subtypes", error });
  }
};

export const getSubtypeById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const subtype = await Subtype.findOne({ _id: req.params.id, userId })
      .populate("type", "name");

    if (!subtype) {
      res.status(404).json({ message: "Subtype not found" });
      return;
    }

    res.status(200).json(subtype);
  } catch (error) {
    res.status(500).json({ message: "Error fetching subtype", error });
  }
};

export const updateSubtype = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, description, type } = req.body;

    const subtype = await Subtype.findOneAndUpdate(
      { _id: req.params.id, userId },
      { name, description, type },
      { new: true, runValidators: true }
    );

    if (!subtype) {
      res.status(404).json({ message: "Subtype not found" });
      return;
    }

    res.status(200).json(subtype);
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(400).json({ message: "A subtype with this name already exists for this type" });
      return;
    }
    res.status(500).json({ message: "Error updating subtype", error });
  }
};

export const deleteSubtype = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const subtype = await Subtype.findOneAndDelete({ _id: req.params.id, userId });

    if (!subtype) {
      res.status(404).json({ message: "Subtype not found" });
      return;
    }

    res.status(200).json({ message: "Subtype deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting subtype", error });
  }
};
