// Centralised error handler: AppError → its code; Zod → VALIDATION_ERROR with
// field issues; Prisma known errors → CONFLICT/NOT_FOUND; everything else is
// logged with the request id and returned as INTERNAL_ERROR without internals.
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import type { Logger } from 'pino';
import { AppError } from './app-error.js';
import { ERR } from '../../config/constants.js';

interface ErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export function errorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    let status = 500;
    let body: ErrorShape = { code: ERR.INTERNAL, message: 'Something went wrong on our side' };

    if (err instanceof AppError) {
      status = err.statusCode;
      body = { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) };
    } else if (err instanceof ZodError) {
      status = 400;
      body = {
        code: ERR.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      };
    } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        status = 409;
        body = { code: ERR.CONFLICT, message: 'A record with the same unique value already exists' };
      } else if (err.code === 'P2025') {
        status = 404;
        body = { code: ERR.NOT_FOUND, message: 'Resource not found' };
      } else if (err.code === 'P2003') {
        status = 400;
        body = { code: ERR.VALIDATION_ERROR, message: 'Related record does not exist' };
      }
    } else if (err instanceof SyntaxError && 'body' in err) {
      status = 400;
      body = { code: ERR.VALIDATION_ERROR, message: 'Malformed JSON body' };
    } else if (err instanceof Error && err.message.includes('request entity too large')) {
      status = 413;
      body = { code: ERR.VALIDATION_ERROR, message: 'Request body too large' };
    }

    const log = { err, requestId: req.requestId, url: req.originalUrl, method: req.method };
    if (status >= 500) logger.error(log, 'unhandled error');
    else logger.warn(log, 'handled error');

    res.status(status).json({ success: false as const, error: body });
  };
}
