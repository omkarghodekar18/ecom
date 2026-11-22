// SMTP mail provider built on nodemailer via a connection URL (SMTP_URL),
// e.g. smtps://user:pass@mail.toolhub.example:465 (MailHog: smtp://127.0.0.1:1025).
//
// Error policy (deliberate, spec Section 10): send() catches transport errors,
// logs them and does NOT rethrow. Auth/checkout flows treat email as
// best-effort — a mail outage must not fail user-facing requests. Logged
// failures can be re-sent later; the queue retries only when a job handler
// throws, which is exactly what we avoid on the user-facing path.
import nodemailer, { type Transporter } from 'nodemailer';
import { getEnv } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { MailMessage, MailProvider } from './mail.types.js';

/** Sends over SMTP. The transporter is created lazily on first send. */
export class SmtpMailProvider implements MailProvider {
  private readonly smtpUrl: string;
  private transporter: Transporter | undefined;

  constructor(smtpUrl: string) {
    this.smtpUrl = smtpUrl;
  }

  async send(msg: MailMessage): Promise<void> {
    try {
      if (!this.smtpUrl) {
        logger.error({ to: msg.to, subject: msg.subject }, 'SMTP_URL is not configured — mail not sent');
        return;
      }
      // nodemailer does not connect at createTransport, so this is cheap.
      this.transporter ??= nodemailer.createTransport(this.smtpUrl);
      await this.transporter.sendMail({
        from: getEnv().MAIL_FROM,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      });
      logger.info({ to: msg.to, subject: msg.subject }, 'mail sent via smtp');
    } catch (err) {
      logger.error({ err, to: msg.to, subject: msg.subject }, 'smtp mail provider failed to send');
    }
  }
}
