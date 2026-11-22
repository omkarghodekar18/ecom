// Cache contract (spec Section 12/17): in-process LRU now, Redis adapter
// later via the same interface — callers never change.

/** Process-local cache with TTL support. Implementations must be safe for concurrent use. */
export interface CacheService {
  /** Returns the cached value, or `undefined` when absent or expired. */
  get<T>(key: string): T | undefined;
  /** Stores `value` under `key` for `ttlMs` milliseconds (overwrites any previous entry). */
  set<T>(key: string, value: T, ttlMs: number): void;
  /** Removes a single key (no-op when absent). */
  delete(key: string): void;
  /** Removes every key starting with `prefix` (cache-namespace invalidation). */
  deletePrefix(prefix: string): void;
  /** Read-through helper: returns the cached value or computes, stores and returns `fn()`. */
  wrap<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
}
