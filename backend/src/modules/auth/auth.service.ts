// Auth service (spec Section 10) — orchestration for registration, email
// verification, refresh rotation, logout and password reset. Login flows live
// in login.service.ts (file-size split; the controller composes both).
// Anti-enumeration rule: register/forgot/OTP-request always behave as if a
// code was sent; existence is never confirmed.
import type { Request } from 'express';
import { AppError, unauthorized } from '../../common/errors/app-error.js';
import { AUTH_EVENT_KIND, ERR } from '../../config/constants.js';
import { hmacHash } from '../../common/utils/crypto.util.js';
import { hashPassword } from '../../common/utils/argon2.util.js';
import { withTransaction } from '../../db/transaction.js';
import { sendMail } from '../../services/mail/index.js';
import type {
  ForgotPasswordInput,
  MeDto,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from '../../shared/dto/auth.dto.js';
import { authRepository } from './auth.repository.js';
import { requestOtp, verifyOtp } from './otp.service.js';
import { issueSession, rotateRefresh, type IssuedSession } from './token.service.js';
import { sessionRepository } from './session.repository.js';
import { sanitizeUserToMe } from './user.mapper.js';

/** Generic anti-enumeration answer (spec Section 10). */
export const GENERIC_AUTH_MESSAGE = 'If this email can proceed, we have sent a code to it';

const OTP_TTL_MIN = 10;

type Ctx = Pick<Request, 'ip' | 'headers'>;

export interface SessionResult {
  user: MeDto;
  session: IssuedSession;
}

/**
 * Registers a customer (B2B users also get a Company with a generated
 * customer number) and mails a REGISTER OTP — or, if the email already
 * exists, does the exact same thing minus the user insert. Always resolves.
 */
async function register(input: RegisterInput, ip: string | null): Promise<void> {
  const existing = await authRepository.findUserByEmail(input.email);
  if (existing?.emailVerifiedAt) {
    // Already registered: keep the response identical, but audit the probe.
    await authRepository.recordAuthEvent({ kind: AUTH_EVENT_KIND.REGISTER_DUPLICATE, email: input.email, ip });
    return;
  }
  if (!existing) {
    await withTransaction(async (tx) => {
      const seq = (await authRepository.countCompanies(tx)) + 1;
      await authRepository.createUser(
        {
          email: input.email,
          passwordHash: await hashPassword(input.password),
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
          role: 'CUSTOMER',
          type: input.type,
          ...(input.type === 'B2B'
            ? {
                company: {
                  name: input.companyName,
                  gstin: input.gstin ?? null,
                  customerNumber: `CUST-${String(seq).padStart(6, '0')}`,
                },
              }
            : {}),
        },
        tx,
      );
    });
  }
  const code = await requestOtp(input.email, 'REGISTER', ip);
  await sendMail(input.email, 'otp', { purpose: 'REGISTER', code, ttlMinutes: OTP_TTL_MIN });
}

/** Consumes the REGISTER OTP, activates the account and starts a session. */
async function verifyEmail(input: VerifyEmailInput, ip: string | null, req: Ctx): Promise<SessionResult> {
  await verifyOtp(input.email, 'REGISTER', input.code, ip);
  const user = await authRepository.findUserByEmail(input.email);
  if (!user) throw new AppError(ERR.OTP_INVALID, 'Invalid verification code', 400);
  if (!user.emailVerifiedAt) {
    await authRepository.updateUser(user.id, { emailVerifiedAt: new Date() });
  }
  await sendMail(user.email, 'welcome', { name: user.firstName });
  const session = await issueSession(user, req);
  return {
    user: sanitizeUserToMe({ ...user, emailVerifiedAt: user.emailVerifiedAt ?? new Date() }),
    session,
  };
}

/** Rotates the refresh cookie into a fresh session (CSRF-guarded route). */
async function refresh(presented: string | undefined, req: Ctx): Promise<SessionResult> {
  const { user, session } = await rotateRefresh(presented, req);
  return { user: sanitizeUserToMe(user), session };
}

/** Revokes just the presented refresh token and audits the logout. */
async function logout(presented: string | undefined, ip: string | null): Promise<void> {
  if (!presented) return;
  const row = await sessionRepository.findByHash(hmacHash(presented));
  if (!row) return;
  if (!row.revokedAt) {
    await sessionRepository.revokeById(row.id);
  }
  const user = await authRepository.findUserById(row.userId);
  if (user) {
    await authRepository.recordAuthEvent({ kind: AUTH_EVENT_KIND.LOGOUT, email: user.email, ip });
  }
}

/** Revokes every refresh token of the user (all devices). */
async function logoutAll(userId: string, ip: string | null): Promise<void> {
  const user = await authRepository.findUserById(userId);
  await sessionRepository.revokeAllForUser(userId);
  if (user) {
    await authRepository.recordAuthEvent({ kind: AUTH_EVENT_KIND.LOGOUT_ALL, email: user.email, ip });
  }
}

/** Password reset, step 1: sends a RESET_PASSWORD OTP to verified users (generic 202). */
async function forgotPassword(input: ForgotPasswordInput, ip: string | null): Promise<void> {
  const code = await requestOtp(input.email, 'RESET_PASSWORD', ip);
  const user = await authRepository.findUserByEmail(input.email);
  if (user?.emailVerifiedAt && user.isActive) {
    await sendMail(input.email, 'otp', { purpose: 'RESET_PASSWORD', code, ttlMinutes: OTP_TTL_MIN });
  }
}

/** Password reset, step 2: consume OTP, set the new password, revoke all sessions. */
async function resetPassword(input: ResetPasswordInput, ip: string | null): Promise<void> {
  await verifyOtp(input.email, 'RESET_PASSWORD', input.code, ip);
  const user = await authRepository.findUserByEmail(input.email);
  if (!user) throw new AppError(ERR.OTP_INVALID, 'Invalid verification code', 400);
  await authRepository.updateUser(user.id, { passwordHash: await hashPassword(input.newPassword) });
  await sessionRepository.revokeAllForUser(user.id);
  await authRepository.recordAuthEvent({
    kind: AUTH_EVENT_KIND.PASSWORD_RESET,
    email: user.email,
    ip,
    detail: { method: 'otp' },
  });
  await sendMail(user.email, 'password-reset', { name: user.firstName });
}

/** Fresh user snapshot for GET /auth/me. */
async function me(userId: string): Promise<MeDto> {
  const user = await authRepository.findUserById(userId);
  if (!user) throw unauthorized('Account no longer exists', ERR.TOKEN_INVALID);
  return sanitizeUserToMe(user);
}

/** Reads the caller's session from the httpOnly refresh cookie WITHOUT
 * rotating anything (read-only, safe for server-side guards like /admin):
 * unrevoked, unexpired token → the user; anything else → null. */
export async function resolveSessionUser(refreshToken: string | undefined): Promise<MeDto | null> {
  if (!refreshToken) return null;
  const row = await sessionRepository.findByHash(hmacHash(refreshToken));
  if (row === null || row.revokedAt !== null || row.expiresAt.getTime() <= Date.now()) return null;
  const user = await authRepository.findUserById(row.userId);
  if (user === null || !user.isActive || user.emailVerifiedAt === null) return null;
  return sanitizeUserToMe(user);
}

export const authService = {
  resolveSessionUser,
  register,
  verifyEmail,
  refresh,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  me,
};
