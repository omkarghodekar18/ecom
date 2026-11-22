// Rate limiting (Section 9/10): general limiter for the API, stricter factory
// for auth/OTP endpoints. In-memory store (single instance, 12-factor note in
// docs/architecture.md; swap for a Postgres/Redis store when scaling out).
import { rateLimit } from 'express-rate-limit';

/** General API quota per minute and IP; override for load tests (env-only). */
const API_LIMIT = Number.parseInt(process.env.API_RATE_LIMIT ?? '', 10) || 300;

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: API_LIMIT,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Health probes must never be throttled (mount prefix is /api/v1 — the old
  // '/api/health' check never matched, so monitors tripped the limiter).
  skip: (req) => req.path.startsWith('/api/v1/health'),
});

export function authLimiter(opts: { windowMs: number; limit: number }) {
  // Integration tests drive dozens of auth calls in minutes from one IP;
  // scale the quota accordingly in test env (behaviour identical elsewhere).
  const testScale = process.env.NODE_ENV === 'test' ? 20 : 1;
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit * testScale,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again later' } },
  });
}
