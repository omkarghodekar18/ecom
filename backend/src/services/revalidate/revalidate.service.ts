// On-demand revalidation (spec 13.9): admin/import/CMS changes enqueue a
// 'web.revalidate' job whose worker POSTs the affected ISR tags to the
// frontend's secured /api/revalidate webhook. Producers are fire-and-forget —
// a dead queue or unreachable frontend logs and moves on (ISR revalidate
// windows are the fallback).
import { logger } from '../../config/logger.js';
import { getEnv } from '../../config/env.js';
import { queue } from '../queue/index.js';

/** pg-boss queue name for revalidation fan-out. */
export const REVALIDATE_QUEUE = 'web.revalidate';

/** Well-known tag namespaces (keep in lockstep with the frontend ISR tags). */
export const TAGS = {
  navigation: 'navigation',
  home: 'home',
  product: (slug: string) => `product:${slug}`,
  category: (code: string) => `category:${code}`,
  cms: (slug: string) => `cms:${slug}`,
} as const;

/**
 * Enqueues one revalidation job for the given tags. Never throws — producers
 * must not fail because the queue is down (the ISR windows eventually catch up).
 */
export function scheduleRevalidate(tags: string[]): void {
  if (tags.length === 0) return;
  void queue.enqueue(REVALIDATE_QUEUE, { tags }).catch((err: unknown) => {
    logger.error({ err, tags }, 'failed to enqueue revalidation');
  });
}

/** Worker body: POST {secret, tags} to the frontend webhook. Best-effort. */
export async function revalidateFrontend(tags: string[]): Promise<void> {
  const env = getEnv();
  const url = `${env.FRONTEND_INTERNAL_URL.replace(/\/$/, '')}/api/revalidate`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.REVALIDATE_SECRET, tags }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      logger.warn({ status: response.status, tags }, 'revalidation webhook returned an error');
      return;
    }
    logger.info({ tags }, 'frontend ISR tags revalidated');
  } catch (err) {
    logger.warn({ err, tags }, 'revalidation webhook unreachable — ISR windows will catch up');
  }
}
