// Session repository — RefreshToken rows. Tokens are stored as HMAC-SHA256
// hashes keyed by familyId; rotation and reuse detection live in token.service.
import type { RefreshToken } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { Transaction } from '../../db/transaction-types.js';

export type RefreshTokenRow = RefreshToken;

function db(tx?: Transaction): Transaction {
  return tx ?? prisma;
}

export const sessionRepository = {
  create(
    data: {
      userId: string;
      tokenHash: string;
      familyId: string;
      userAgent: string | null;
      ip: string | null;
      expiresAt: Date;
    },
    tx?: Transaction,
  ): Promise<RefreshTokenRow> {
    return db(tx).refreshToken.create({ data });
  },

  findByHash(tokenHash: string, tx?: Transaction): Promise<RefreshTokenRow | null> {
    return db(tx).refreshToken.findUnique({ where: { tokenHash } });
  },

  /** Session lookup scoped to its owner — IDOR-safe revocation check. */
  findByIdForUser(id: string, userId: string, tx?: Transaction): Promise<RefreshTokenRow | null> {
    return db(tx).refreshToken.findFirst({ where: { id, userId } });
  },

  revokeById(id: string, tx?: Transaction): Promise<unknown> {
    return db(tx).refreshToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  },

  /** Kills every live token of a family — the reuse-detection shotgun. */
  revokeFamily(familyId: string, tx?: Transaction): Promise<unknown> {
    return db(tx).refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  },

  revokeAllForUser(userId: string, tx?: Transaction): Promise<unknown> {
    return db(tx).refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  },

  /** Password change: every session except the one that made the request. */
  revokeAllForUserExcept(userId: string, keepId: string, tx?: Transaction): Promise<unknown> {
    return db(tx).refreshToken.updateMany({
      where: { userId, revokedAt: null, id: { not: keepId } },
      data: { revokedAt: new Date() },
    });
  },

  /** Live sessions (not revoked, not expired), newest first. */
  listActive(userId: string, tx?: Transaction): Promise<RefreshTokenRow[]> {
    return db(tx).refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  },
};
