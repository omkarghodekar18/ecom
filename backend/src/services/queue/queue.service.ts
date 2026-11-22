// QueueService implementations: pg-boss (Postgres-backed) and an inline
// executor used in tests/dev. Neither ever throws out of enqueue/start —
// the API must survive a dead queue (spec Section 9 cross-cutting).
import { PgBoss } from 'pg-boss';
import { getEnv } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { EnqueueOptions, QueueService } from './queue.types.js';

/**
 * pg-boss backed queue (spec Section 2: Postgres-backed jobs, no Redis).
 *
 * Error policy (deliberate): a queue outage must not take the API down.
 * `start()` failures are logged and leave the service in "not started";
 * `enqueue()` on a dead/not-started queue logs and returns. Job payloads
 * (order confirmation emails, import batches) are re-triggerable manually,
 * and a broken queue is visible in logs and `/health/ready`.
 */
export class PgBossQueueService implements QueueService {
  private readonly boss: PgBoss;
  private started = false;
  /** Queue names already created in this process (createQueue is idempotent but not free). */
  private readonly knownQueues = new Set<string>();
  /** Workers registered before start() — flushed as soon as the boss is up. */
  private readonly pendingWorkers: { name: string; register: () => Promise<void> }[] = [];

  constructor(connectionString: string) {
    this.boss = new PgBoss({ connectionString });
  }

  async start(): Promise<void> {
    if (this.started) return;
    try {
      await this.boss.start();
      this.started = true;
      logger.info('pg-boss queue started');
      const pending = this.pendingWorkers.splice(0, this.pendingWorkers.length);
      for (const w of pending) {
        try {
          await w.register();
        } catch (err) {
          logger.error({ err, queue: w.name }, 'deferred worker registration failed');
        }
      }
    } catch (err) {
      // Never crash the boot: the API serves traffic without background jobs.
      logger.error({ err }, 'queue start failed — running without background jobs');
    }
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    try {
      await this.boss.stop();
    } catch (err) {
      logger.error({ err }, 'queue stop failed');
    } finally {
      this.started = false;
    }
  }

  async enqueue<T>(name: string, data: T, opts?: EnqueueOptions): Promise<void> {
    if (!this.started) {
      logger.error({ queue: name }, 'enqueue on a queue that is not started — job dropped');
      return;
    }
    try {
      await this.ensureQueue(name);
      const sendOpts = opts?.delayInSec !== undefined ? { startAfter: opts.delayInSec } : undefined;
      await this.boss.send(name, data as unknown as object, sendOpts);
    } catch (err) {
      logger.error({ err, queue: name }, 'queue enqueue failed — job dropped');
    }
  }

  async work<T>(name: string, handler: (data: T) => Promise<void>): Promise<void> {
    if (!this.started) {
      // Modules register workers at import time, which happens before the
      // queue starts in main(). Defer until start() flushes the list.
      this.pendingWorkers.push({
        name,
        register: () => this.registerWorker(name, handler),
      });
      logger.debug({ queue: name }, 'queue worker registration deferred until start');
      return;
    }
    await this.registerWorker(name, handler);
  }

  /** pg-boss v12 hands the handler a batch (default batchSize 1); fan out to
   *  our per-job handler contract. Errors are logged, then rethrown so
   *  pg-boss applies its retry policy. */
  private async registerWorker<T>(name: string, handler: (data: T) => Promise<void>): Promise<void> {
    await this.ensureQueue(name);
    await this.boss.work<T>(name, async (jobs) => {
      for (const job of jobs) {
        try {
          await handler(job.data);
        } catch (err) {
          logger.error({ err, queue: name, jobId: job.id }, 'queue job handler failed');
          throw err;
        }
      }
    });
    logger.info({ queue: name }, 'queue worker registered');
  }

  /** Creates the queue on first use; an existing queue (other process) is fine. */
  private async ensureQueue(name: string): Promise<void> {
    if (this.knownQueues.has(name)) return;
    try {
      await this.boss.createQueue(name);
    } catch (err) {
      // Already created elsewhere, or a transient failure — send/work will
      // surface a real problem if there is one.
      logger.debug({ err, queue: name }, 'createQueue skipped/failed');
    }
    this.knownQueues.add(name);
  }
}

/**
 * Test/dev queue: no infrastructure at all. `enqueue` executes the handler
 * registered via `work` immediately (awaited); `delayInSec` is ignored.
 * Enqueueing onto a name with no registered handler logs a warning and drops
 * the job (workers must be registered first — they always are at boot).
 */
export class InlineQueueService implements QueueService {
  private readonly handlers = new Map<string, (data: unknown) => Promise<void>>();

  async start(): Promise<void> {
    /* nothing to connect to */
  }

  async stop(): Promise<void> {
    this.handlers.clear();
  }

  async enqueue<T>(name: string, data: T, _opts?: EnqueueOptions): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) {
      logger.warn({ queue: name }, 'inline enqueue without a registered handler — job dropped');
      return;
    }
    await handler(data);
  }

  async work<T>(name: string, handler: (data: T) => Promise<void>): Promise<void> {
    this.handlers.set(name, (data: unknown) => handler(data as T));
  }
}

/** Process-wide queue singleton, chosen by QUEUE_ENABLED (tests/dev run inline). */
export const queue: QueueService = getEnv().QUEUE_ENABLED
  ? new PgBossQueueService(getEnv().DATABASE_URL)
  : new InlineQueueService();
