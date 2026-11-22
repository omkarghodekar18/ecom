// CSRF double-submit guard (spec Section 10): cookie-authenticated mutations
// (refresh, logout) must echo the non-httpOnly `th_csrf` cookie back in the
// `X-CSRF-Token` header. Bearer-authenticated requests carry no ambient
// credentials, so they skip the check.
import type { NextFunction, Request, Response } from 'express';
import { COOKIES, ERR } from '../../config/constants.js';
import { AppError } from '../errors/app-error.js';
import { timingSafeEqualStr } from '../utils/crypto.util.js';

/** Compares header and cookie in constant time; 403 CSRF_FAILED otherwise. */
export function csrfMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (req.header('authorization')) {
    next(); // Bearer-authenticated — no ambient cookie authority to forge.
    return;
  }
  const cookie = req.cookies?.[COOKIES.csrf];
  const header = req.header('x-csrf-token');
  if (!cookie || !header || !timingSafeEqualStr(header, cookie)) {
    next(new AppError(ERR.CSRF_FAILED, 'Missing or invalid CSRF token', 403));
    return;
  }
  next();
}
