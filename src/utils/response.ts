import { Response } from "express";

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const sendSuccess = (res: Response, data: any, status = 200) => {
  res.status(status).json({ success: true, data });
};

export const sendPaginated = (res: Response, data: any[], pagination: Pagination) => {
  res.status(200).json({ success: true, data, pagination });
};

export const sendError = (res: Response, message: string, status = 500) => {
  res.status(status).json({ success: false, error: { message } });
};
