// Reads OTP codes from the dev mail outbox (file mail provider). Each email is
// written as `<timestamp>-<sanitized-email>-<subject-slug>.html` with the code
// inside an element with id="otp-code" (see services/mail/templates/otp.template.ts).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SUBJECT_SLUGS = {
  REGISTER: 'verify-your-toolhub-account',
  LOGIN: 'your-toolhub-sign-in-code',
  RESET_PASSWORD: 'reset-your-toolhub-password',
} as const;

export type OtpPurposeName = keyof typeof SUBJECT_SLUGS;

function sanitizeEmail(email: string): string {
  return email.replace(/[^a-zA-Z0-9.-]/g, '-');
}

/**
 * Returns the 6-digit code from the newest outbox email for `email`+`purpose`.
 * Throws when no matching email exists yet (call after the API responded).
 */
export function readOtp(email: string, purpose: OtpPurposeName): string {
  const outbox = resolve(process.cwd(), 'var/outbox');
  if (!existsSync(outbox)) throw new Error(`outbox not found: ${outbox}`);
  const prefix = `${sanitizeEmail(email)}-${SUBJECT_SLUGS[purpose]}`;
  const matches = readdirSync(outbox)
    .filter((f) => f.endsWith('.html') && f.includes(prefix))
    .sort()
    .reverse();
  const newest = matches[0];
  if (!newest) throw new Error(`no outbox email found for ${prefix}`);
  const html = readFileSync(resolve(outbox, newest), 'utf8');
  const m = html.match(/id="otp-code"[^>]*>\s*(\d{6})/);
  if (!m?.[1]) throw new Error(`no otp-code found in ${newest}`);
  return m[1] as string;
}
