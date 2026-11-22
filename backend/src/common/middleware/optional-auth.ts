// Optional authentication: sets req.userId/req.userRole when a VALID bearer is
// presented and passes through when the header is absent. A presented-but-
// invalid or expired bearer still fails 401 — silently downgrading a signed-in
// customer to guest would misprice their cart (same policy as the pricing
// controller, factored out here for the cart/quick-order modules).
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ERR } from '../../config/constants.js';
import { unauthorized } from '../errors/app-error.js';
import { verifyAccessToken } from '../utils/jwt.util.js';

export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (header === undefined) {
    next(); // guest — no credentials presented
    return;
  }
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    next(); // foreign scheme with no bearer — treat as guest
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.userRole = payload.role;
    req.sessionId = payload.sid;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(unauthorized('Access token expired', ERR.TOKEN_EXPIRED));
      return;
    }
    next(unauthorized('Invalid access token', ERR.TOKEN_INVALID));
  }
}
