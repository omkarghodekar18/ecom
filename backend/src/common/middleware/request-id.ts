// Request id + Express type augmentation.
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- classic express augmentation
  namespace Express {
    interface Request {
      requestId: string;
      /** Populated by `authenticate` middleware. */
      userId?: string;
      userRole?: string;
      /** Refresh-token row id carried in the access JWT (`sid`) — identifies the current session. */
      sessionId?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id = incoming && incoming.length <= 64 ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
}
