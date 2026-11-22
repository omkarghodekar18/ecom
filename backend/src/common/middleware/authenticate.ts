// `authenticate` (spec Sections 9/10): verifies the `Authorization: Bearer`
// access JWT, then loads userId/role/sessionId onto the request and mirrors
// {id, role} into res.locals for downstream layers. Stateless by design —
// revocation is enforced at the refresh-token layer, not here.
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ERR } from '../../config/constants.js';
import { unauthorized } from '../errors/app-error.js';
import { verifyAccessToken } from '../utils/jwt.util.js';

function readBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

/**
 * Express middleware guarding routes that require a signed-in user.
 * Failure modes carry distinct stable codes so the client can distinguish
 * "no token" (UNAUTHORIZED), "bad token" (TOKEN_INVALID) and "access token
 * expired, call /auth/refresh" (TOKEN_EXPIRED).
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = readBearer(req.header('authorization'));
  if (!token) {
    next(unauthorized('Authentication required', ERR.UNAUTHORIZED));
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.userRole = payload.role;
    req.sessionId = payload.sid;
    res.locals.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    // Expired access tokens are expected every ACCESS_TOKEN_TTL_MIN minutes;
    // the client should silently refresh, hence the dedicated code.
    if (err instanceof jwt.TokenExpiredError) {
      next(unauthorized('Access token expired', ERR.TOKEN_EXPIRED));
      return;
    }
    next(unauthorized('Invalid access token', ERR.TOKEN_INVALID));
  }
}

/**
 * Extracts the authenticated user id for handlers that run after
 * `authenticate` (which guarantees it is set). Throws 401 otherwise.
 */
export function requireUserId(req: Request): string {
  if (!req.userId) {
    throw unauthorized('Authentication required', ERR.UNAUTHORIZED);
  }
  return req.userId;
}
