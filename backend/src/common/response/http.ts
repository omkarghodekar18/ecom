// Response envelope: { success, data, meta? } / { success:false, error }  (Section 9).
import type { NextFunction, Request, Response } from 'express';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function ok<T>(res: Response, data: T, meta?: PageMeta, status = 200): void {
  const body = meta ? { success: true as const, data, meta } : { success: true as const, data };
  res.status(status).json(body);
}

export function okCreated<T>(res: Response, data: T): void {
  ok(res, data, undefined, 201);
}

/** Wraps an async handler so rejections reach the error middleware uniformly. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
