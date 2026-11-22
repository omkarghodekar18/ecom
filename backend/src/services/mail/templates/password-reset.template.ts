// Password-changed notification (spec Section 10 security: users must be
// alerted when their credentials change).
import type { MailContent } from '../mail.types.js';
import { escapeHtml, renderLayout, renderTextFooter } from './layout.js';

/**
 * Renders the "your password was changed" security notification.
 *
 * @param name Recipient first name (or full name) for the greeting.
 */
export function passwordResetTemplate(name: string): MailContent {
  const subject = 'Your ToolHub password was changed';
  const greeting = `Hello ${name},`;
  const main =
    'This is a confirmation that the password for your ToolHub account was just changed. You can now sign in with your new password.';
  const warning =
    'If you did not make this change, your account may be compromised. Reset your password immediately via the "Forgot password" link and contact our support team.';

  const bodyHtml = `
    <p style="margin:0 0 20px 0;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 24px 0;">${escapeHtml(main)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
      <tr>
        <td style="background:#FEF2F2;border:1px solid #DC2626;border-radius:8px;padding:16px 20px;font-size:13px;line-height:20px;color:#7F1D1D;">
          <strong>Security notice:</strong> ${escapeHtml(warning)}
        </td>
      </tr>
    </table>
    <p style="margin:0;">— The ToolHub team</p>`;

  const text = [
    greeting,
    '',
    main,
    '',
    `Security notice: ${warning}`,
    '',
    '— The ToolHub team',
    '',
    renderTextFooter(),
  ].join('\n');

  return { subject, html: renderLayout({ preheader: 'Confirmation: your ToolHub password was changed.', bodyHtml }), text };
}
