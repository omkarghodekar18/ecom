// Session cookies (spec Section 10). Both cookies use path '/' so that
// a) the storefront proxy gate can see `th_rt` on page requests, and
// b) client JS can read `th_csrf` from document.cookie for the double-submit
//    header. Security is carried by httpOnly (th_rt), SameSite=Lax and the
// CSRF check itself — not by path scoping (which would break both use cases).
import type { CookieOptions, Response } from 'express';
import { COOKIES } from '../../config/constants.js';
import { getEnv, isProd } from '../../config/env.js';
import type { IssuedSession } from './token.service.js';

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
    maxAge: getEnv().REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  };
}

function csrfCookieOptions(): CookieOptions {
  return {
    httpOnly: false,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
    maxAge: getEnv().REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  };
}

/** Sets both session cookies (login, verify, OTP login, refresh rotation). */
export function applySessionCookies(res: Response, session: IssuedSession): void {
  res.cookie(COOKIES.refresh, session.refreshToken, refreshCookieOptions());
  res.cookie(COOKIES.csrf, session.csrfToken, csrfCookieOptions());
}

/** Clears both session cookies (logout, logout-all, password reset). */
export function clearSessionCookies(res: Response): void {
  res.clearCookie(COOKIES.refresh, refreshCookieOptions());
  res.clearCookie(COOKIES.csrf, csrfCookieOptions());
}
