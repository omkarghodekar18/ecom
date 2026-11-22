// Background-job contract (spec Sections 2/17). pg-boss today; the interface
// keeps callers decoupled so the transport can change without touching them.

/** Options accepted when enqueuing a job. */
export interface EnqueueOptions {
  /** Delay before the job becomes eligible for a worker, in seconds. */
  delayInSec?: number;
}

/**
 * Background job queue. `enqueue` is fire-and-forget by design: producers
 * (request handlers) must never block or fail because of the queue.
 */
export interface QueueService {
  /** Connects and prepares the queue storage. Must be safe to call once at boot. */
  start(): Promise<void>;
  /** Drains in-flight work and closes connections (graceful shutdown). */
  stop(): Promise<void>;
  /** Publishes a job named `name` with payload `data`. */
  enqueue<T>(name: string, data: T, opts?: EnqueueOptions): Promise<void>;
  /** Registers the handler for jobs named `name` (one handler per name). */
  work<T>(name: string, handler: (data: T) => Promise<void>): Promise<void>;
}
