// OTP repository — OtpCode table access. Codes are stored HMAC-hashed; the
// plaintext only exists in the mail that carries it.
import type { OtpCode } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { Transaction } from '../../db/transaction-types.js';
import type { OtpPurpose } from '../../shared/enums.js';

export type OtpRow = OtpCode;

function db(tx?: Transaction): Transaction {
  return tx ?? prisma;
}

export const otpRepository = {
  /** Newest unconsumed code for (email, purpose) — at most one is active by invariant. */
  findActiveOtp(email: string, purpose: OtpPurpose, tx?: Transaction): Promise<OtpRow | null> {
    return db(tx).otpCode.findFirst({
      where: { email, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  },

  createOtp(
    data: { email: string; purpose: OtpPurpose; codeHash: string; expiresAt: Date },
    tx?: Transaction,
  ): Promise<OtpRow> {
    return db(tx).otpCode.create({ data });
  },

  /** Counts a failed attempt; the row dies at MAX_ATTEMPTS (checked in the service). */
  incrementAttempts(id: string, tx?: Transaction): Promise<unknown> {
    return db(tx).otpCode.update({ where: { id }, data: { attempts: { increment: 1 } } });
  },

  consume(id: string, tx?: Transaction): Promise<unknown> {
    return db(tx).otpCode.update({ where: { id }, data: { consumedAt: new Date() } });
  },

  /** Retires any unconsumed codes for (email, purpose) — one active OTP at a time. */
  invalidateActive(email: string, purpose: OtpPurpose, tx?: Transaction): Promise<unknown> {
    return db(tx).otpCode.updateMany({
      where: { email, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  },
};
