// Cryptographic helpers for auth (spec Section 10): OTP generation/hashing
// and constant-time comparisons. All randomness comes from node:crypto.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { getEnv } from '../../config/env.js';

/** Digits in an OTP code (spec: 6). */
const OTP_DIGITS = 6;

/**
 * Generates a cryptographically random numeric OTP.
 *
 * @returns A 6-digit string with leading zeros preserved (`randomInt` draws
 * uniformly from [0, 10^6), so every code is equally likely).
 */
export function randomOtp(): string {
  return String(randomInt(0, 10 ** OTP_DIGITS)).padStart(OTP_DIGITS, '0');
}

/**
 * HMAC-SHA256 of `value` under the server secret (env `HMAC_SECRET`), hex-
 * encoded. Used to store OTP codes and refresh tokens hashed-at-rest: the
 * hash is deterministic, so lookups work, but a database leak does not
 * reveal usable codes/tokens without the secret.
 */
export function hmacHash(value: string): string {
  return createHmac('sha256', getEnv().HMAC_SECRET).update(value, 'utf8').digest('hex');
}

/**
 * A random hex token (default 48 bytes → 96 hex chars) for refresh tokens,
 * CSRF tokens and similar opaque secrets.
 */
export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Constant-time string equality. Both sides are SHA-256 hashed first so the
 * comparison never short-circuits on length (and never leaks how many bytes
 * matched). Use for OTP codes, token hashes and CSRF tokens.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}
