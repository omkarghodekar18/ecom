// Login service (spec Section 10): password and passwordless (OTP) login with
// progressive brute-force lockout. Split from auth.service.ts to keep files
// small — the controller composes both.
import type { Request } from 'express';
import { AppError, tooMany, unauthorized } from '../../common/errors/app-error.js';
import { AUTH_EVENT_KIND, ERR } from '../../config/constants.js';
import { verifyPassword } from '../../common/utils/argon2.util.js';
import { sendMail } from '../../services/mail/index.js';
import type { LoginPasswordInput, OtpRequestInput, OtpVerifyInput } from '../../shared/dto/auth.dto.js';
import { authRepository } from './auth.repository.js';
import { requestOtp, verifyOtp } from './otp.service.js';
import { issueSession } from './token.service.js';
import { sanitizeUserToMe } from './user.mapper.js';
import type { SessionResult } from './auth.service.js';

const OTP_TTL_MIN = 10;
const LOCKOUT_FAILS = 5;
const LOCKOUT_WINDOW_MIN = 15;
/** Argon2id hash of a random string — compared against for unknown emails so login timing stays constant. */
const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$pLmEexPKU5lEqorDdFf6LA$V1tXGQPv9oXbAmIIc3pF/JFzXNNU91NcKW6WtiY+3Nk';

type Ctx = Pick<Request, 'ip' | 'headers'>;

/** Progressive lockout gate: ≥5 LOGIN_FAILs for the email (then IP) in 15 min blocks the attempt. */
async function assertNotLockedOut(email: string, ip: string | null): Promise<void> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60_000);
  const emailFails = await authRepository.countRecentLoginFailuresByEmail(email, since);
  if (emailFails >= LOCKOUT_FAILS) {
    await authRepository.recordAuthEvent({
      kind: AUTH_EVENT_KIND.LOCKOUT,
      email,
      ip,
      detail: { scope: 'email', retryAfterMin: LOCKOUT_WINDOW_MIN },
    });
    throw new AppError(ERR.ACCOUNT_LOCKED, 'Account temporarily locked after too many failed attempts', 429, {
      retryAfterMin: LOCKOUT_WINDOW_MIN,
    });
  }
  if (ip) {
    const ipFails = await authRepository.countRecentLoginFailuresByIp(ip, since);
    if (ipFails >= LOCKOUT_FAILS) {
      await authRepository.recordAuthEvent({ kind: AUTH_EVENT_KIND.LOCKOUT, email, ip, detail: { scope: 'ip' } });
      throw tooMany('Too many failed login attempts from this network');
    }
  }
}

/** Email + password login with lockout gating and constant-ish failure timing. */
async function loginPassword(input: LoginPasswordInput, ip: string | null, req: Ctx): Promise<SessionResult> {
  await assertNotLockedOut(input.email, ip);
  const user = await authRepository.findUserByEmail(input.email);
  if (!user?.passwordHash) {
    await verifyPassword(DUMMY_ARGON2_HASH, input.password); // equalise argon2 timing for unknown emails
    await authRepository.recordAuthEvent({
      kind: AUTH_EVENT_KIND.LOGIN_FAIL,
      email: input.email,
      ip,
      detail: { reason: 'unknown_account' },
    });
    throw unauthorized('Invalid email or password', ERR.INVALID_CREDENTIALS);
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    await authRepository.recordAuthEvent({
      kind: AUTH_EVENT_KIND.LOGIN_FAIL,
      email: input.email,
      ip,
      detail: { reason: 'bad_password' },
    });
    throw unauthorized('Invalid email or password', ERR.INVALID_CREDENTIALS);
  }
  if (!user.isActive) {
    await authRepository.recordAuthEvent({
      kind: AUTH_EVENT_KIND.LOGIN_FAIL,
      email: input.email,
      ip,
      detail: { reason: 'inactive' },
    });
    throw new AppError(ERR.ACCOUNT_INACTIVE, 'This account has been deactivated', 403);
  }
  if (!user.emailVerifiedAt) {
    throw new AppError(ERR.EMAIL_UNVERIFIED, 'Please verify your email address first', 403, { canResendOtp: true });
  }
  await authRepository.recordAuthEvent({
    kind: AUTH_EVENT_KIND.LOGIN_SUCCESS,
    email: user.email,
    ip,
    detail: { method: 'password' },
  });
  await authRepository.updateUser(user.id, { lastLoginAt: new Date() });
  return { user: sanitizeUserToMe(user), session: await issueSession(user, req) };
}

/** Passwordless login, step 1: sends a LOGIN OTP to verified users (generic 202 otherwise). */
async function loginOtpRequest(input: OtpRequestInput, ip: string | null): Promise<void> {
  const code = await requestOtp(input.email, 'LOGIN', ip);
  const user = await authRepository.findUserByEmail(input.email);
  if (user?.emailVerifiedAt && user.isActive) {
    await sendMail(input.email, 'otp', { purpose: 'LOGIN', code, ttlMinutes: OTP_TTL_MIN });
  }
}

/** Passwordless login, step 2: consume the LOGIN OTP and start a session. */
async function loginOtpVerify(input: OtpVerifyInput, ip: string | null, req: Ctx): Promise<SessionResult> {
  await verifyOtp(input.email, 'LOGIN', input.code, ip);
  const user = await authRepository.findUserByEmail(input.email);
  if (!user?.emailVerifiedAt || !user.isActive) {
    throw unauthorized('Invalid email or code', ERR.INVALID_CREDENTIALS);
  }
  await authRepository.recordAuthEvent({
    kind: AUTH_EVENT_KIND.LOGIN_SUCCESS,
    email: user.email,
    ip,
    detail: { method: 'otp' },
  });
  await authRepository.updateUser(user.id, { lastLoginAt: new Date() });
  return { user: sanitizeUserToMe(user), session: await issueSession(user, req) };
}

export const loginService = { loginPassword, loginOtpRequest, loginOtpVerify };
