// OTP email (spec Section 10): registration verification, passwordless login
// and password reset all deliver the same 6-digit code with a purpose-specific
// subject line and copy.
import type { OtpPurpose } from '../../../shared/enums.js';
import type { MailContent } from '../mail.types.js';
import { escapeHtml, renderLayout, renderTextFooter } from './layout.js';

/** Purpose-specific subject lines (assert: all three differ — see unit tests). */
const SUBJECTS: Record<OtpPurpose, string> = {
  REGISTER: 'Verify your ToolHub account',
  LOGIN: 'Your ToolHub sign-in code',
  RESET_PASSWORD: 'Reset your ToolHub password',
};

const INTROS: Record<OtpPurpose, string> = {
  REGISTER: 'Use the code below to verify your email address and activate your ToolHub account.',
  LOGIN: 'Enter this code to sign in to your ToolHub account. You received this email because a sign-in was requested with your address.',
  RESET_PASSWORD: 'Use the code below to reset the password for your ToolHub account.',
};

/**
 * Renders the OTP email for any auth purpose.
 *
 * @param purpose Which flow the code belongs to — drives subject and intro copy.
 * @param code The 6-digit OTP (already generated; never log it).
 * @param ttlMinutes How long the code stays valid (spec: 10 minutes).
 */
export function otpTemplate(purpose: OtpPurpose, code: string, ttlMinutes: number): MailContent {
  const subject = SUBJECTS[purpose];
  const intro = INTROS[purpose];
  const expiresIn = `This code expires in ${String(ttlMinutes)} minutes.`;
  const ignore =
    'If you did not request this, you can safely ignore this email — the code will expire on its own.';

  const bodyHtml = `
    <p style="margin:0 0 20px 0;">Hello,</p>
    <p style="margin:0 0 24px 0;">${escapeHtml(intro)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
      <tr>
        <td align="center" style="background:#FFF3EA;border:1px solid #EA580C;border-radius:8px;padding:20px 12px;">
          <span id="otp-code" style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:bold;letter-spacing:10px;color:#1F2937;">${escapeHtml(code)}</span>
          <span style="display:block;margin-top:8px;font-size:12px;color:#6B7280;">Your verification code</span>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 12px 0;">${escapeHtml(expiresIn)}</p>
    <p style="margin:0;color:#6B7280;font-size:13px;line-height:20px;">${escapeHtml(ignore)}</p>`;

  const text = [
    'Hello,',
    '',
    intro,
    '',
    `  Your verification code: ${code}`,
    '',
    expiresIn,
    ignore,
    '',
    renderTextFooter(),
  ].join('\n');

  return { subject, html: renderLayout({ preheader: `${intro} Code: ${code}`, bodyHtml }), text };
}
