// Settings service tests with injected fakes (no database needed): default
// merging, cache behaviour, write-through + invalidation, failure fallbacks.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryCacheService } from '../../src/services/cache/cache.service.js';
import type { SettingsRow, SettingsStorage } from '../../src/services/settings/settings.service.js';
import { createSettingsService, DEFAULT_SETTINGS } from '../../src/services/settings/settings.service.js';

/** In-memory SettingsStorage double with call spies. */
function fakeStorage(initial: SettingsRow[] = []) {
  const rows = [...initial];
  const findMany = vi.fn(async (): Promise<SettingsRow[]> => [...rows]);
  const upsert = vi.fn(async (args: {
    where: { key: string };
    create: { key: string; value: unknown };
    update: { value: unknown };
  }): Promise<unknown> => {
    const existing = rows.findIndex((r) => r.key === args.where.key);
    const row = { key: args.where.key, value: args.update.value };
    if (existing >= 0) rows[existing] = row;
    else rows.push(row);
    return row;
  });
  const storage: SettingsStorage = { setting: { findMany, upsert } };
  return { storage, rows, findMany, upsert };
}

describe('settings service', () => {
  let cache: MemoryCacheService;

  beforeEach(() => {
    cache = new MemoryCacheService();
  });

  it('returns defaults merged over an empty table', async () => {
    const { storage } = fakeStorage();
    const svc = createSettingsService({ cache, prisma: storage });

    expect(await svc.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges stored rows over defaults per key', async () => {
    const { storage } = fakeStorage([{ key: 'tax', value: { ratePercent: 5 } }]);
    const svc = createSettingsService({ cache, prisma: storage });

    const settings = await svc.getSettings();
    expect(settings.tax.ratePercent).toBe(5);
    expect(settings.shipping).toEqual(DEFAULT_SETTINGS.shipping); // untouched key
  });

  it('falls back to the default per key when a row is corrupt', async () => {
    const { storage } = fakeStorage([{ key: 'tax', value: { ratePercent: 'eighteen' } }]);
    const svc = createSettingsService({ cache, prisma: storage });

    expect((await svc.getSettings()).tax.ratePercent).toBe(DEFAULT_SETTINGS.tax.ratePercent);
  });

  it('serves the second read from cache without touching storage', async () => {
    const { storage, findMany } = fakeStorage();
    const svc = createSettingsService({ cache, prisma: storage });

    await svc.getSettings();
    await svc.getSettings();
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('never lets callers mutate the cached settings', async () => {
    const { storage } = fakeStorage();
    const svc = createSettingsService({ cache, prisma: storage });

    const first = await svc.getSettings();
    first.tax.ratePercent = 99;
    expect((await svc.getSettings()).tax.ratePercent).toBe(DEFAULT_SETTINGS.tax.ratePercent);
  });

  it('falls back to defaults when the DB read fails, then recovers', async () => {
    const { storage, findMany } = fakeStorage();
    findMany.mockRejectedValueOnce(new Error('relation "Setting" does not exist'));
    const svc = createSettingsService({ cache, prisma: storage });

    expect(await svc.getSettings()).toEqual(DEFAULT_SETTINGS); // no crash
    expect(await svc.getSettings()).toEqual(DEFAULT_SETTINGS); // retried the DB (not cached failure)
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('updateSettings writes each key, invalidates the cache and returns fresh values', async () => {
    const { storage, upsert } = fakeStorage();
    const svc = createSettingsService({ cache, prisma: storage });

    await svc.getSettings(); // warm the cache with defaults
    const updated = await svc.updateSettings({
      tax: { ratePercent: 28 },
      shipping: { flatRateInr: 300, freeThresholdInr: 20_000, note: 'Flat rate' },
    });

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith({
      where: { key: 'tax' },
      create: { key: 'tax', value: { ratePercent: 28 } },
      update: { value: { ratePercent: 28 } },
    });
    expect(updated.tax.ratePercent).toBe(28);
    expect(updated.shipping.flatRateInr).toBe(300);
    // The new value is actually persisted for future readers.
    expect((await svc.getSettings()).tax.ratePercent).toBe(28);
  });

  it('updateSettings with no keys is a read-only no-op', async () => {
    const { storage, upsert } = fakeStorage();
    const svc = createSettingsService({ cache, prisma: storage });

    expect(await svc.updateSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('updateSettings rejects an invalid patch before writing anything', async () => {
    const { storage, upsert } = fakeStorage();
    const svc = createSettingsService({ cache, prisma: storage });

    await expect(
      // @ts-expect-error -- runtime guard against non-numeric payloads (e.g. from JSON)
      svc.updateSettings({ tax: { ratePercent: 'eighteen' } }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(upsert).not.toHaveBeenCalled();
  });
});
