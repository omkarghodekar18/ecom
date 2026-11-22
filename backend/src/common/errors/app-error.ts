// Application error type carrying a stable machine-readable code (Section 9).
import { ERR, type ErrorCode } from '../../config/constants.js';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(ERR.VALIDATION_ERROR, message, 400, details);
export const unauthorized = (message = 'Authentication required', code: ErrorCode = ERR.UNAUTHORIZED) =>
  new AppError(code, message, 401);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(ERR.FORBIDDEN, message, 403);
export const notFound = (message = 'Resource not found') => new AppError(ERR.NOT_FOUND, message, 404);
export const conflict = (message: string, details?: unknown) => new AppError(ERR.CONFLICT, message, 409, details);
export const tooMany = (message = 'Too many requests, please slow down') =>
  new AppError(ERR.RATE_LIMITED, message, 429);
