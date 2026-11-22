// Session/token service (spec Section 10): access JWTs + rotating refresh
// tokens with family-based reuse detection.
//
// - Access JWT: 15 min (ACCESS_TOKEN_TTL_MIN), payload {sub, role, type, sid};
//   never in a cookie, only the JSON body + `Authorization: Bearer`.
// - Refresh token: 48-byte hex, stored HMAC-hashed with a random familyId;
//   rotated on every refresh. Presenting a revoked token revokes the whole
//   family (theft response) and yields 401 TOKEN_INVALID.
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { getEnv } from '../../config/env.js';
import { ERR } from '../../config/constants.js';
import { unauthorized } from '../../common/errors/app-error.js';
import { hmacHash, randomToken } from '../../common/utils/crypto.util.js';
import { signAccessToken } from '../../common/utils/jwt.util.js';
import { withTransaction } from '../../db/transaction.js';
import { logger } from '../../config/logger.js';
import { authRepository, type UserWithCompany } from './auth.repository.js';
import { sessionRepository } from './session.repository.js';

/** Everything a login-ish flow needs to answer the client (cookies set by the controller). */
export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  sid: string;
}

const invalidRefresh = (message = 'Invalid refresh token') => unauthorized(message, ERR.TOKEN_INVALID);

function refreshExpiry(): Date {
  return new Date(Date.now() + getEnv().REFRESH_TOKEN_TTL_DAYS * 86_400_000);
}

/** Issues a brand-new session (new family) for `user`. */
export async function issueSession(
  user: { id: string; role: UserWithCompany['role']; type: UserWithCompany['type'] },
  req: Pick<Request, 'ip' | 'headers'>,
): Promise<IssuedSession> {
  const refreshToken = randomToken(48);
  const row = await sessionRepository.create({
    userId: user.id,
    tokenHash: hmacHash(refreshToken),
    familyId: randomUUID(),
    userAgent: req.headers['user-agent'] ?? null,
    ip: req.ip ?? null,
    expiresAt: refreshExpiry(),
  });
  return {
    refreshToken,
    csrfToken: randomToken(16),
    sid: row.id,
    accessToken: signAccessToken(user, row.id),
  };
}

/**
 * Rotates the presented refresh token: revoke old → issue new (same family).
 * Reuse of a revoked token kills the entire family; expired or unknown tokens
 * are plain 401 TOKEN_INVALID (the client must re-authenticate).
 */
export async function rotateRefresh(
  presented: string | undefined,
  req: Pick<Request, 'ip' | 'headers'>,
): Promise<{ user: UserWithCompany; session: IssuedSession }> {
  if (!presented) throw invalidRefresh('Refresh token missing');
  const row = await sessionRepository.findByHash(hmacHash(presented));
  if (!row) throw invalidRefresh();

  if (row.revokedAt) {
    // Reuse detected: a token we already rotated is being replayed — assume
    // theft and kill every session in the family.
    await sessionRepository.revokeFamily(row.familyId);
    logger.warn({ familyId: row.familyId }, 'refresh token reuse detected; family revoked');
    throw invalidRefresh('Refresh token reuse detected');
  }
  if (row.expiresAt.getTime() < Date.now()) throw invalidRefresh('Refresh token expired');

  const user = await authRepository.findUserById(row.userId);
  if (!user || !user.isActive) {
    await sessionRepository.revokeFamily(row.familyId);
    throw invalidRefresh();
  }

  const session = await withTransaction(async (tx): Promise<IssuedSession> => {
    await sessionRepository.revokeById(row.id, tx);
    const refreshToken = randomToken(48);
    const next = await sessionRepository.create(
      {
        userId: user.id,
        tokenHash: hmacHash(refreshToken),
        familyId: row.familyId, // same family — this is rotation, not a new login
        userAgent: req.headers['user-agent'] ?? null,
        ip: req.ip ?? null,
        expiresAt: refreshExpiry(),
      },
      tx,
    );
    return {
      refreshToken,
      csrfToken: randomToken(16),
      sid: next.id,
      accessToken: signAccessToken(user, next.id),
    };
  });
  return { user, session };
}
