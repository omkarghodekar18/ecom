// Mail contracts (spec Section 2/10): provider interface behind which SMTP,
// file-outbox (dev) or any other transport can live.

/** A fully rendered, ready-to-send email. */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Everything a template function returns; `to` is added by the service. */
export interface MailContent {
  subject: string;
  html: string;
  text: string;
}

/**
 * Transport adapter. Best-effort by design (spec Section 10: transactional
 * email must never block or fail auth flows): implementations catch their own
 * errors, log them, and resolve normally. Failures are observable via logs /
 * the dev outbox, and senders may retry later.
 */
export interface MailProvider {
  send(msg: MailMessage): Promise<void>;
}
