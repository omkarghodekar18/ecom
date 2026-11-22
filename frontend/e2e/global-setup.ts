// Playwright global setup (spec Section 21): prepares the dev environment
// for a repeatable e2e run.
// - Resets the OTP send-limit counters in the dev database (5 sends/hour per
//   email AND per IP in otp.service.ts — repeated e2e runs exhaust the cap
//   long before the suite is flaky for any other reason). The helper script
//   refuses to touch non-local databases.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const RESET_SCRIPT = resolve(__dirname, '../../backend/scripts/reset-otp-rate-limit.cjs');

export default function globalSetup(): void {
  try {
    const out = execFileSync('node', [RESET_SCRIPT, 'b2c@example.com'], {
      cwd: resolve(__dirname, '../../backend'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(`[e2e global-setup] ${out.trim()}`);
  } catch (err) {
    // Non-fatal: the OTP test reports a clear error when the limit still
    // applies; everything else in the suite runs regardless.
    console.error('[e2e global-setup] OTP limit reset failed:', err instanceof Error ? err.message : err);
  }
}
