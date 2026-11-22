// Welcome email: sent once an account has been activated (registration OTP
// verified by an admin-driven or self-service flow — spec Section 10).
import type { MailContent } from '../mail.types.js';
import { escapeHtml, renderLayout, renderTextFooter } from './layout.js';

/**
 * Renders the account-activated welcome email.
 *
 * @param name Recipient first name (or full name) for the greeting.
 */
export function welcomeTemplate(name: string): MailContent {
  const subject = 'Welcome to ToolHub — your account is active';
  const greeting = `Hello ${name},`;

  const bodyHtml = `
    <p style="margin:0 0 20px 0;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 12px 0;">Your ToolHub account is now active. You can sign in with your email address and password to start ordering industrial tools, measuring equipment and workshop supplies.</p>
    <p style="margin:0 0 24px 0;">A quick reminder of what your account gives you:</p>
    <ul style="margin:0 0 24px 0;padding-left:20px;color:#374151;">
      <li style="margin-bottom:8px;">Access to our full catalogue with live stock and lead times.</li>
      <li style="margin-bottom:8px;">Order history, invoices and delivery tracking in one place.</li>
      <li style="margin-bottom:8px;">Quick order entry by article number for repeat purchases.</li>
    </ul>
    <p style="margin:0 0 12px 0;">We are glad to have you on board.</p>
    <p style="margin:0;">— The ToolHub team</p>`;

  const text = [
    greeting,
    '',
    'Your ToolHub account is now active. You can sign in with your email address and password to start ordering industrial tools, measuring equipment and workshop supplies.',
    '',
    'A quick reminder of what your account gives you:',
    '  * Access to our full catalogue with live stock and lead times.',
    '  * Order history, invoices and delivery tracking in one place.',
    '  * Quick order entry by article number for repeat purchases.',
    '',
    'We are glad to have you on board.',
    '',
    '— The ToolHub team',
    '',
    renderTextFooter(),
  ].join('\n');

  return { subject, html: renderLayout({ preheader: 'Your ToolHub account is active — welcome aboard.', bodyHtml }), text };
}
