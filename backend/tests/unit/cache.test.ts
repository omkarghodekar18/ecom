// MemoryCacheService unit tests: TTL expiry, LRU-ish eviction, wrap.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryCacheService } from '../../src/services/cache/cache.service.js';

describe('MemoryCacheService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and returns a value', () => {
    const cache = new MemoryCacheService();
    cache.set('k', { a: 1 }, 1_000);
    expect(cache.get<{ a: number }>('k')).toEqual({ a: 1 });
  });

  it('expires entries after the TTL', () => {
    const cache = new MemoryCacheService();
    cache.set('k', 'v', 1_000);

    vi.advanceTimersByTime(999);
    expect(cache.get('k')).toBe('v');

    vi.advanceTimersByTime(1);
    expect(cache.get('k')).toBeUndefined();
  });

  it('drops a non-positive TTL immediately instead of caching a dead entry', () => {
    const cache = new MemoryCacheService();
    cache.set('k', 'v', 0);
    expect(cache.get('k')).toBeUndefined();
    expect(cache.get('never-set')).toBeUndefined();
  });

  it('evicts the least recently used entry when at capacity', () => {
    const cache = new MemoryCacheService(3);
    cache.set('a', 1, 10_000);
    cache.set('b', 2, 10_000);
    cache.set('c', 3, 10_000);

    // Touch 'a' so 'b' becomes the least recently used key.
    expect(cache.get('a')).toBe(1);

    cache.set('d', 4, 10_000);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('refreshes an existing key without evicting anything', () => {
    const cache = new MemoryCacheService(2);
    cache.set('a', 1, 10_000);
    cache.set('b', 2, 10_000);
    cache.set('a', 9, 10_000);
    expect(cache.get('a')).toBe(9);
    expect(cache.get('b')).toBe(2);
  });

  it('deletes single keys and by prefix', () => {
    const cache = new MemoryCacheService();
    cache.set('nav:1', 'x', 10_000);
    cache.set('nav:2', 'y', 10_000);
    cache.set('other', 'z', 10_000);

    cache.delete('nav:1');
    expect(cache.get('nav:1')).toBeUndefined();
    expect(cache.get('nav:2')).toBe('y');

    cache.deletePrefix('nav:');
    expect(cache.get('nav:2')).toBeUndefined();
    expect(cache.get('other')).toBe('z');
  });

  it('wrap computes once and then serves from cache', async () => {
    const cache = new MemoryCacheService();
    const fn = vi.fn(async () => 'computed');

    expect(await cache.wrap('k', 1_000, fn)).toBe('computed');
    expect(await cache.wrap('k', 1_000, fn)).toBe('computed');
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_001);
    await cache.wrap('k', 1_000, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('wrap serves the cached reference on subsequent calls', async () => {
    const cache = new MemoryCacheService();
    const fn = vi.fn(async () => ({ list: [1, 2, 3] }));

    const first = await cache.wrap('k', 5_000, fn);
    const second = await cache.wrap('k', 5_000, fn);
    expect(second).toEqual(first);
    // Same reference — the cache stores what fn produced; callers must not
    // mutate cached values (services clone defensively where needed).
    expect(second).toBe(first);
  });
});
