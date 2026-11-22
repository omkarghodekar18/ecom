// OTP service (spec Section 10): issue/verify 6-digit codes with cooldown,
// attempt and hourly send limits. The service is user-agnostic — it always
// stores and counts codes for any email so behaviour cannot be used to probe
// whether an account exists; the auth service decides whether to mail it.
import { AppError } from '../../common/errors/app-error.js';
import { ERR } from '../../config/constants.js';
import { hmacHash, randomOtp, timingSafeEqualStr } from '../../common/utils/crypto.util.js';
import { withTransaction } from '../../db/transaction.js';
import { authRepository } from './auth.repository.js';
import { otpRepository } from './otp.repository.js';
import { AUTH_EVENT_KIND } from '../../config/constants.js';
import type { OtpPurpose } from '../../shared/enums.js';

const TTL_MINUTES = 10;
const RESEND_COOLDOWN_SEC = 60;
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;

const minutesAgo = (min: number) => new Date(Date.now() - min * 60_000);

/**
 * Issues a fresh OTP for (email, purpose).
 *
 * Rules: max 5 sends/hour per email AND per IP (429 RATE_LIMITED); 60 s
 * resend cooldown (429 OTP_COOLDOWN); a new code invalidates the previous
 * active one for the same (email, purpose).
 *
 * @returns The plaintext code — the caller decides whether it is mailed.
 */
export async function requestOtp(email: string, purpose: OtpPurpose, ip: string | null): Promise<string> {
  const since = minutesAgo(60);
  const byEmail = await authRepository.countRecentOtpRequests({ email }, since);
  const byIp = ip ? await authRepository.countRecentOtpRequests({ ip }, since) : 0;
  if (byEmail >= MAX_SENDS_PER_HOUR || byIp >= MAX_SENDS_PER_HOUR) {
    throw new AppError(ERR.RATE_LIMITED, 'Too many code requests, please try again later', 429);
  }

  const active = await otpRepository.findActiveOtp(email, purpose);
  if (active) {
    const elapsed = (Date.now() - active.createdAt.getTime()) / 1000;
    if (elapsed < RESEND_COOLDOWN_SEC) {
      throw new AppError(ERR.OTP_COOLDOWN, 'Please wait before requesting another code', 429, {
        retryAfterSec: Math.ceil(RESEND_COOLDOWN_SEC - elapsed),
      });
    }
  }

  const code = randomOtp();
  await withTransaction(async (tx) => {
    await otpRepository.invalidateActive(email, purpose, tx);
    await otpRepository.createOtp(
      { email, purpose, codeHash: hmacHash(code), expiresAt: new Date(Date.now() + TTL_MINUTES * 60_000) },
      tx,
    );
    await authRepository.recordAuthEvent(
      { kind: AUTH_EVENT_KIND.OTP_REQUEST, email, ip, detail: { purpose } },
      tx,
    );
  });
  return code;
}

/**
 * Verifies and consumes the active OTP for (email, purpose).
 *
 * @throws 400 OTP_INVALID (no/unknown code or mismatch), OTP_EXPIRED,
 * OTP_MAX_ATTEMPTS after 5 failed tries — the code is dead from then on.
 */
export async function verifyOtp(email: string, purpose: OtpPurpose, code: string, ip: string | null): Promise<void> {
  const otp = await otpRepository.findActiveOtp(email, purpose);
  if (!otp) {
    throw new AppError(ERR.OTP_INVALID, 'Invalid verification code', 400);
  }
  if (otp.expiresAt.getTime() < Date.now()) {
    throw new AppError(ERR.OTP_EXPIRED, 'Code expired, please request a new one', 400);
  }
  if (otp.attempts >= MAX_VERIFY_ATTEMPTS) {
    throw new AppError(ERR.OTP_MAX_ATTEMPTS, 'Too many attempts, please request a new code', 400);
  }
  if (!timingSafeEqualStr(hmacHash(code), otp.codeHash)) {
    await otpRepository.incrementAttempts(otp.id);
    throw new AppError(ERR.OTP_INVALID, 'Invalid verification code', 400);
  }
  await withTransaction(async (tx) => {
    await otpRepository.consume(otp.id, tx);
    await authRepository.recordAuthEvent(
      { kind: AUTH_EVENT_KIND.OTP_CONSUMED, email, ip, detail: { purpose } },
      tx,
    );
  });
}
