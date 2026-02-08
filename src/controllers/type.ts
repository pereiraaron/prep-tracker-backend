import { Response } from "express";
import { Type } from "../models";
import { AuthRequest } from "../types";

export const createType = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, description, fields } = req.body;

    const type = await Type.create({ name, description, fields, userId });

    res.status(201).json(type);
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(400).json({ message: "A type with this name already exists" });
      return;
    }
    res.status(500).json({ message: "Error creating type", error });
  }
};

export const getAllTypes = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const types = await Type.find({ userId }).sort({ createdAt: -1 });

    res.status(200).json(types);
  } catch (error) {
    res.status(500).json({ message: "Error fetching types", error });
  }
};

export const getTypeById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const type = await Type.findOne({ _id: req.params.id, userId });

    if (!type) {
      res.status(404).json({ message: "Type not found" });
      return;
    }

    res.status(200).json(type);
  } catch (error) {
    res.status(500).json({ message: "Error fetching type", error });
  }
};

export const updateType = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, description, fields } = req.body;

    const type = await Type.findOneAndUpdate(
      { _id: req.params.id, userId },
      { name, description, fields },
      { new: true, runValidators: true }
    );

    if (!type) {
      res.status(404).json({ message: "Type not found" });
      return;
    }

    res.status(200).json(type);
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(400).json({ message: "A type with this name already exists" });
      return;
    }
    res.status(500).json({ message: "Error updating type", error });
  }
};

export const deleteType = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const type = await Type.findOneAndDelete({ _id: req.params.id, userId });

    if (!type) {
      res.status(404).json({ message: "Type not found" });
      return;
    }

    res.status(200).json({ message: "Type deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting type", error });
  }
};
