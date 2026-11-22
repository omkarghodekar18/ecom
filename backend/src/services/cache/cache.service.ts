// In-memory CacheService implementation: Map + TTL entries + LRU-ish eviction.
import type { CacheService } from './cache.types.js';

/** Bookkeeping for one cached entry. */
interface CacheEntry {
  value: unknown;
  /** Epoch ms after which the entry is stale (checked lazily on read). */
  expiresAt: number;
}

/** Default capacity — sized for facet metadata + navigation tree, not row data. */
const DEFAULT_MAX_ENTRIES = 500;

/**
 * Bounded in-memory cache.
 *
 * - TTL entries: expiry is enforced lazily on read (no background timer).
 * - Capacity: when full, the least recently used entry is evicted (reads and
 *   writes refresh recency by re-inserting the key).
 * - LRU-ish, not strict: `Date.now()` based TTLs mean an entry evicted at
 *   capacity may still have had TTL left — that is the accepted trade-off.
 */
export class MemoryCacheService implements CacheService {
  private readonly maxEntries: number;
  /** Map preserves insertion order, so the first key is the least recently used. */
  private readonly entries = new Map<string, CacheEntry>();

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError(`maxEntries must be a positive integer, got ${String(maxEntries)}`);
    }
    this.maxEntries = maxEntries;
  }

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      // Lazy expiry: drop stale entries the moment they are touched.
      this.entries.delete(key);
      return undefined;
    }
    // Refresh recency so capacity evicts the truly least recently used key.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (ttlMs <= 0) {
      // A non-positive TTL means "do not cache" — never store an instantly dead entry.
      this.entries.delete(key);
      return;
    }
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  deletePrefix(prefix: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  async wrap<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const fresh = await fn();
    this.set(key, fresh, ttlMs);
    return fresh;
  }
}

/** Process-wide cache singleton (facet metadata, navigation tree, settings). */
export const cache = new MemoryCacheService();
