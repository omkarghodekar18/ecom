// Runtime settings (spec Sections 11/15): tax rate, shipping rules, stock
// policy and feature flags, stored per top-level key in the `Setting` table
// (key → Json) and read through the cache. Reads never throw: on any DB
// problem the API falls back to defaults (a missing settings table must not
// take checkout down) — only admin writes surface errors.
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { ERR } from '../../config/constants.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../common/errors/app-error.js';
import { cache } from '../cache/index.js';
import type { CacheService } from '../cache/index.js';
import { prisma } from '../../db/prisma.js';

/** Stock policy (spec Section 11): sell only what is on the shelf, or accept backorders. */
export type StockPolicy = 'STOCK_ONLY' | 'ALLOW_BACKORDER';

/** Per-key validation — also guards against corrupt rows in the Setting table. */
const KeySchemas = {
  tax: z.object({ ratePercent: z.number().min(0).max(100) }),
  shipping: z.object({
    flatRateInr: z.number().min(0),
    freeThresholdInr: z.number().min(0),
    note: z.string(),
    /** Optional express delivery rate (checkout shows the method only when set). */
    expressRateInr: z.number().min(0).optional(),
  }),
  stock: z.object({ policy: z.enum(['STOCK_ONLY', 'ALLOW_BACKORDER']) }),
  features: z.object({ razorpayCheckout: z.boolean() }),
} as const;

export type SettingKey = keyof typeof KeySchemas;

/** The whole settings document. Kept in lockstep with the schemas above. */
export type AppSettings = { -readonly [K in SettingKey]: z.infer<(typeof KeySchemas)[K]> };

/** Defaults used whenever a key (or the whole table) is missing. */
export const DEFAULT_SETTINGS: AppSettings = {
  tax: { ratePercent: 18 },
  shipping: { flatRateInr: 250, freeThresholdInr: 10_000, note: 'Calculated at checkout' },
  stock: { policy: 'ALLOW_BACKORDER' },
  features: { razorpayCheckout: false },
};

/** Minimal persistence surface (satisfied by the real PrismaClient; fakes in tests). */
export interface SettingsRow {
  key: string;
  /** Prisma hands back JsonValue; the schemas below validate it on read. */
  value: unknown;
}

export interface SettingsUpsertArgs {
  where: { key: string };
  create: { key: string; value: Prisma.InputJsonValue };
  update: { value: Prisma.InputJsonValue };
}

export interface SettingsStorage {
  setting: {
    findMany(): Promise<SettingsRow[]>;
    upsert(args: SettingsUpsertArgs): Promise<unknown>;
  };
}

const CACHE_KEY = 'settings:all';
const CACHE_TTL_MS = 60_000;

export interface SettingsService {
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
}

export interface SettingsDeps {
  cache: CacheService;
  prisma: SettingsStorage;
}

/**
 * Builds a settings service. The factory exists for tests (inject a fake
 * cache and storage); the app uses the `settingsService` singleton.
 */
export function createSettingsService({ cache, prisma }: SettingsDeps): SettingsService {
  /** Deep-clone on every hand-out so callers can never mutate cached state. */
  const clone = (s: AppSettings): AppSettings => structuredClone(s);

  /**
   * Correlated write for the merge step: keeps key and value types in sync
   * when the key is a union member (a plain `overrides[key] = value` does not
   * typecheck for union keys).
   */
  function assignOverride<K extends SettingKey>(target: Partial<AppSettings>, key: K, value: AppSettings[K]): void {
    target[key] = value;
  }

  /** Defaults + rows, with each stored row validated by its key schema. */
  function merge(rows: SettingsRow[]): AppSettings {
    const overrides: Partial<AppSettings> = {};
    for (const row of rows) {
      const schema = KeySchemas[row.key as SettingKey];
      if (!schema) continue; // unknown key (future/legacy row) — ignored
      const parsed = schema.safeParse(row.value);
      if (parsed.success) {
        assignOverride(overrides, row.key as SettingKey, parsed.data);
      } else {
        logger.warn(
          { key: row.key, issues: parsed.error.issues },
          'settings row failed validation — using default',
        );
      }
    }
    return { ...structuredClone(DEFAULT_SETTINGS), ...overrides };
  }

  return {
    async getSettings(): Promise<AppSettings> {
      const cached = cache.get<AppSettings>(CACHE_KEY);
      if (cached) return clone(cached);
      try {
        const rows = await prisma.setting.findMany();
        const settings = merge(rows);
        cache.set(CACHE_KEY, settings, CACHE_TTL_MS);
        return clone(settings);
      } catch (err) {
        // Table missing / DB down: serve defaults, do NOT cache them so the
        // next read retries the database as soon as it recovers.
        logger.error({ err }, 'settings read failed — serving defaults');
        return clone(DEFAULT_SETTINGS);
      }
    },

    async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
      const entries = Object.entries(patch) as Array<[SettingKey, unknown]>;
      if (entries.length === 0) return this.getSettings();

      // Validate before writing so a bad patch can never poison every reader.
      const validated: Array<[SettingKey, Prisma.InputJsonValue]> = [];
      for (const [key, value] of entries) {
        const parsed = KeySchemas[key].safeParse(value);
        if (!parsed.success) {
          const details = parsed.error.issues.map((i) => `${key}.${i.path.join('.')}: ${i.message}`);
          throw new AppError(ERR.VALIDATION_ERROR, `Invalid settings for '${key}'`, 400, details);
        }
        validated.push([key, parsed.data]);
      }

      // Writes DO surface DB errors: an admin update must not pretend to succeed.
      for (const [key, value] of validated) {
        await prisma.setting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        });
      }
      cache.delete(CACHE_KEY);
      return this.getSettings();
    },
  };
}

/** App-wide settings service (real cache + real Prisma). */
export const settingsService = createSettingsService({ cache, prisma });
