// Dev/test mail provider: writes every message into var/outbox as .html and
// .txt files so developers can inspect the exact rendered email (MailHog-free
// local dev; var/ is gitignored).
//
// Error policy (shared with the SMTP provider): send() catches its own
// errors, logs them and resolves normally — email is best-effort and must
// never fail an auth or checkout flow (spec Section 10). The outbox makes
// failures visible and retryable manually.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { logger } from '../../config/logger.js';
import type { MailMessage, MailProvider } from './mail.types.js';

/** Default outbox location — relative to the backend working directory. */
const DEFAULT_OUTBOX_DIR = resolve(process.cwd(), 'var/outbox');

/** `2025-11-21T09-30-00-000Z` — filesystem-safe ISO timestamp. */
function fileTimestamp(now = new Date()): string {
  return now.toISOString().replaceAll(/[:.]/g, '-');
}

/** `raj@example.com` → `raj-example.com` (keep it readable, drop unsafe chars). */
function sanitizeEmail(to: string): string {
  return to.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'recipient';
}

/** Subject → short url-style slug for the tail of the filename. */
function slugify(subject: string): string {
  return (
    subject
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'mail'
  );
}

/** Writes rendered emails to the local outbox directory. */
export class FileMailProvider implements MailProvider {
  private readonly outboxDir: string;

  constructor(outboxDir: string = DEFAULT_OUTBOX_DIR) {
    this.outboxDir = outboxDir;
  }

  async send(msg: MailMessage): Promise<void> {
    try {
      await mkdir(this.outboxDir, { recursive: true });
      const base = `${this.outboxDir}/${fileTimestamp()}-${sanitizeEmail(msg.to)}-${slugify(msg.subject)}`;
      await writeFile(`${base}.html`, msg.html, 'utf8');
      await writeFile(`${base}.txt`, `${msg.subject}\n\nto: ${msg.to}\n\n${msg.text}\n`, 'utf8');
      logger.info({ to: msg.to, subject: msg.subject, file: `${base}.html` }, 'mail written to outbox');
    } catch (err) {
      logger.error({ err, to: msg.to, subject: msg.subject }, 'file mail provider failed to write outbox');
    }
  }
}
