// Brands service — read-only public surface (list with counts, detail) plus
// admin CRUD. Product listing by brand is intentionally NOT here: it belongs
// to the products module (later phase); brands stay metadata-only.
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { conflict, notFound } from '../../common/errors/app-error.js';
import { slugify } from '../../common/utils/slug.util.js';
import { withTransaction } from '../../db/transaction.js';
import type { Transaction } from '../../db/transaction-types.js';
import { writeAudit } from '../../services/audit/index.js';
import { cache } from '../../services/cache/index.js';
import type { BrandDto } from '../../shared/dto/catalog.dto.js';
import { mediaUrl } from '../catalog/public-id.util.js';
import { brandsRepository, type BrandRow } from './brands.repository.js';

// ── input contracts (shared/dto is frozen; module-owned schemas live here) ──

export const CreateBrandInputSchema = z.object({
  name: z.string().min(1).max(140),
  slug: z.string().min(1).max(160).optional(),
  isPremium: z.boolean().default(false),
  logoPublicId: z.string().max(200).optional().nullable(),
  badgeColor: z.string().max(40).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
});
export type CreateBrandInput = z.infer<typeof CreateBrandInputSchema>;

export const UpdateBrandInputSchema = z.object({
  name: z.string().min(1).max(140).optional(),
  slug: z.string().min(1).max(160).optional(),
  isPremium: z.boolean().optional(),
  logoPublicId: z.string().max(200).optional().nullable(),
  badgeColor: z.string().max(40).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
});
export type UpdateBrandInput = z.infer<typeof UpdateBrandInputSchema>;

// ── DTO mapping ─────────────────────────────────────────────────────────────

const BRANDS_CACHE_KEY = 'brands:list';
const BRANDS_CACHE_TTL_MS = 5 * 60_000;

/** Public listing row: BrandDto + productCount (the list carries counts). */
export type BrandWithCountDto = BrandDto & { productCount: number };

function toBrandDto(row: BrandRow): BrandDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    isPremium: row.isPremium,
    logo: mediaUrl(row.logoPublicId),
    description: row.description,
  };
}

/** Optional text fields may arrive as "" — store NULL instead. */
function blankToNull(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === '' ? null : value;
}

async function mustFindBrand(id: string, tx?: Transaction): Promise<BrandRow> {
  const row = await brandsRepository.findById(id, tx);
  if (!row) throw notFound('Brand not found');
  return row;
}

/** Slug + "-2", "-3"… until free (slug is globally unique in the schema). */
async function uniqueBrandSlug(base: string, excludeId: string | null, tx: Transaction): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (await brandsRepository.slugTaken(candidate, excludeId, tx)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
    if (suffix > 50) throw conflict(`Could not derive a unique slug for '${base}'`);
  }
  return candidate;
}

// ── public reads ────────────────────────────────────────────────────────────

/** All brands with PUBLISHED product counts; cached 5 min under 'brands:'. */
async function list(): Promise<BrandWithCountDto[]> {
  return cache.wrap(BRANDS_CACHE_KEY, BRANDS_CACHE_TTL_MS, async () => {
    const rows = await brandsRepository.listWithProductCounts();
    return rows.map((row) => ({ ...toBrandDto(row), productCount: row.productCount }));
  });
}

async function bySlug(slug: string): Promise<BrandDto> {
  const row = await brandsRepository.findBySlug(slug);
  if (!row) throw notFound('Brand not found');
  return toBrandDto(row);
}

// ── admin writes ────────────────────────────────────────────────────────────

async function create(actorId: string, input: CreateBrandInput, ip: string | null): Promise<BrandDto> {
  const row = await withTransaction(async (tx) => {
    if (await brandsRepository.findByName(input.name, tx)) {
      throw conflict(`Brand name '${input.name}' is already in use`);
    }
    const slug = await uniqueBrandSlug(slugify(input.slug?.trim() || input.name) || 'brand', null, tx);
    const created = await brandsRepository.create(
      {
        name: input.name,
        slug,
        isPremium: input.isPremium,
        logoPublicId: blankToNull(input.logoPublicId),
        badgeColor: blankToNull(input.badgeColor),
        description: blankToNull(input.description),
      },
      tx,
    );
    await writeAudit(actorId, 'brand.create', 'brand', created.id, { name: input.name, slug }, ip, tx);
    return created;
  });
  cache.deletePrefix('brands:');
  return toBrandDto(row);
}

async function update(actorId: string, id: string, input: UpdateBrandInput, ip: string | null): Promise<BrandDto> {
  const row = await withTransaction(async (tx) => {
    const current = await mustFindBrand(id, tx);
    if (input.name !== undefined && input.name !== current.name) {
      const clash = await brandsRepository.findByName(input.name, tx);
      if (clash !== null && clash.id !== id) throw conflict(`Brand name '${input.name}' is already in use`);
    }
    const data: Prisma.BrandUncheckedUpdateInput = {};
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    const track = (field: string, from: unknown, to: unknown): void => {
      (data as Record<string, unknown>)[field] = to;
      diff[field] = { from, to };
    };

    if (input.name !== undefined && input.name !== current.name) track('name', current.name, input.name);
    if (input.isPremium !== undefined && input.isPremium !== current.isPremium) {
      track('isPremium', current.isPremium, input.isPremium);
    }
    if (input.logoPublicId !== undefined) {
      const v = blankToNull(input.logoPublicId);
      if (v !== current.logoPublicId) track('logoPublicId', current.logoPublicId, v);
    }
    if (input.badgeColor !== undefined) {
      const v = blankToNull(input.badgeColor);
      if (v !== current.badgeColor) track('badgeColor', current.badgeColor, v);
    }
    if (input.description !== undefined) {
      const v = blankToNull(input.description);
      if (v !== current.description) track('description', current.description, v);
    }
    if (input.slug !== undefined && input.slug !== current.slug) {
      const slug = await uniqueBrandSlug(slugify(input.slug) || 'brand', id, tx);
      if (slug !== current.slug) track('slug', current.slug, slug);
    }

    const updated = Object.keys(data).length > 0 ? await brandsRepository.updateById(id, data, tx) : current;
    await writeAudit(actorId, 'brand.update', 'brand', id, diff, ip, tx);
    return updated;
  });
  cache.deletePrefix('brands:');
  return toBrandDto(row);
}

/** DELETE — hard delete; 409 CONFLICT while any product references the brand. */
async function remove(actorId: string, id: string, ip: string | null): Promise<void> {
  await withTransaction(async (tx) => {
    const current = await mustFindBrand(id, tx);
    const products = await brandsRepository.countProducts(id, tx);
    if (products > 0) throw conflict('Brand still has products', { products });
    await brandsRepository.deleteById(id, tx);
    await writeAudit(actorId, 'brand.delete', 'brand', id, { slug: current.slug }, ip, tx);
  });
  cache.deletePrefix('brands:');
}

export const brandsService = {
  list,
  bySlug,
  create,
  update,
  remove,
};
