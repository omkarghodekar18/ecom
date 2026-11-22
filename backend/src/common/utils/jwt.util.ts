// Access-token primitives (spec Section 10): short-lived JWT (15 min via
// ACCESS_TOKEN_TTL_MIN) signed with JWT_ACCESS_SECRET. Payload carries
// {sub, role, type, sid} — `sid` is the refresh-token row id so "current
// session" is identifiable without a DB round-trip.
import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import { getEnv } from '../../config/env.js';
import type { Role, UserType } from '../../shared/enums.js';

/** Claims inside every access token issued by the auth module. */
export interface AccessTokenPayload {
  sub: string;
  role: Role;
  type: UserType;
  sid: string;
}

function isPayload(value: unknown): value is AccessTokenPayload & JwtPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sub' in value &&
    'role' in value &&
    'type' in value &&
    'sid' in value
  );
}

/** Signs an access token for `user`, bound to session `sid`. */
export function signAccessToken(
  user: { id: string; role: Role; type: UserType },
  sid: string,
): string {
  const env = getEnv();
  return jwt.sign({ role: user.role, type: user.type, sid }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: `${env.ACCESS_TOKEN_TTL_MIN}m`,
  });
}

/**
 * Verifies an access token and returns its claims. Throws the raw
 * `jsonwebtoken` errors (TokenExpiredError etc.) — the authenticate
 * middleware maps them to stable error codes.
 */
export function verifyAccessToken(token: string): AccessTokenPayload & JwtPayload {
  const decoded: unknown = jwt.verify(token, getEnv().JWT_ACCESS_SECRET);
  if (!isPayload(decoded)) {
    throw new jwt.JsonWebTokenError('unexpected token payload');
  }
  return decoded;
}
