import { Response } from "express";

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Normalize _id → id and remove __v on lean/plain objects */
const normalize = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(normalize);
  if (obj && typeof obj === "object" && obj._id) {
    // Mongoose document — let toJSON handle it (it already maps _id → id)
    if (typeof obj.toJSON === "function") return obj;
    // Lean plain object — manually map _id → id
    const { _id, __v, ...rest } = obj;
    return { id: _id.toString(), ...rest };
  }
  return obj;
};

export const sendSuccess = (res: Response, data: any, status = 200) => {
  res.status(status).json({ success: true, data: normalize(data) });
};

export const sendPaginated = (res: Response, data: any[], pagination: Pagination) => {
  res.status(200).json({ success: true, data: normalize(data), pagination });
};

export const sendError = (res: Response, message: string, status = 500) => {
  res.status(status).json({ success: false, error: { message } });
};
