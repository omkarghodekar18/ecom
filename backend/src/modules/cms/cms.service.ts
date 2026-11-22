// CMS service — home composition (banners by placement + top-level category
// tiles + SEO), published pages (unknown/malformed blocks dropped and logged,
// spec 6.11), banner reads per placement, and admin CRUD for banners + pages.
// Every admin write runs in one transaction with an audit row and invalidates
// the 'cms:' cache prefix.
import { z } from 'zod';
import type { Prisma, CmsPage } from '@prisma/client';
import { notFound } from '../../common/errors/app-error.js';
import { slugify } from '../../common/utils/slug.util.js';
import { logger } from '../../config/logger.js';
import { withTransaction } from '../../db/transaction.js';
import type { Transaction } from '../../db/transaction-types.js';
import { writeAudit } from '../../services/audit/index.js';
import { scheduleRevalidate, TAGS } from '../../services/revalidate/index.js';
import { cache } from '../../services/cache/index.js';
import { BannerPlacementSchema, CmsBlockSchema } from '../../shared/dto/cms.dto.js';
import type {
  BannerDto,
  BannerPlacementName,
  CmsBlock,
  CmsPageDto,
  HomeCategoryTile,
  HomeDto,
} from '../../shared/dto/cms.dto.js';
import { mediaUrl } from '../catalog/public-id.util.js';
import { cmsRepository, type BannerRow } from './cms.repository.js';

// ── input contracts (shared/dto is frozen; module-owned schemas live here) ──

export const CreateBannerInputSchema = z.object({
  placement: BannerPlacementSchema,
  eyebrow: z.string().max(120).nullable().optional(),
  heading: z.string().min(1).max(200),
  subheading: z.string().max(500).nullable().optional(),
  ctaLabel: z.string().max(80).nullable().optional(),
  ctaHref: z.string().max(500).nullable().optional(),
  imagePublicId: z.string().min(1).max(200),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});
export type CreateBannerInput = z.infer<typeof CreateBannerInputSchema>;

export const UpdateBannerInputSchema = CreateBannerInputSchema.partial();
export type UpdateBannerInput = z.infer<typeof UpdateBannerInputSchema>;

const PageStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

/** POST /admin/cms/pages — create-or-update by slug (blocks registry-validated). */
export const SaveCmsPageInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(160)
    .transform((s) => slugify(s))
    .refine((s) => s.length > 0, 'Slug must contain URL-safe characters'),
  title: z.string().min(1).max(200),
  blocks: z.array(CmsBlockSchema).max(100),
  seoTitle: z.string().max(200).nullable().optional(),
  seoDescription: z.string().max(500).nullable().optional(),
  status: PageStatusSchema.default('DRAFT'),
});
export type SaveCmsPageInput = z.infer<typeof SaveCmsPageInputSchema>;

/** PATCH /admin/cms/pages/:slug — partial update by slug. */
export const UpdateCmsPageInputSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  blocks: z.array(CmsBlockSchema).max(100).optional(),
  seoTitle: z.string().max(200).nullable().optional(),
  seoDescription: z.string().max(500).nullable().optional(),
  status: PageStatusSchema.optional(),
});
export type UpdateCmsPageInput = z.infer<typeof UpdateCmsPageInputSchema>;

// ── DTO mapping ─────────────────────────────────────────────────────────────

const CMS_HOME_CACHE_KEY = 'cms:home';
const CMS_CACHE_TTL_MS = 5 * 60_000;

/** A PUBLISHED page with this slug overrides the homepage SEO defaults. */
const HOME_SEO_PAGE_SLUG = 'home';

const HOME_SEO_DEFAULTS = {
  seoTitle: 'ToolHub India — industrial tools for professionals',
  seoDescription:
    'Cutting tools, measuring equipment, clamping and workshop supplies for manufacturing businesses across India — live stock, transparent net prices, fast delivery.',
} as const;

function toBannerDto(row: BannerRow): BannerDto {
  return {
    placement: row.placement,
    eyebrow: row.eyebrow,
    heading: row.heading,
    subheading: row.subheading,
    ctaLabel: row.ctaLabel,
    ctaHref: row.ctaHref,
    image: mediaUrl(row.imagePublicId) ?? '',
    sortOrder: row.sortOrder,
  };
}

/**
 * Admin write response: the public BannerDto plus the row id the back office
 * needs to target PATCH/DELETE (public reads stay exactly BannerDto).
 */
export type AdminBannerDto = BannerDto & { id: string };

function toAdminBannerDto(row: BannerRow): AdminBannerDto {
  return { id: row.id, ...toBannerDto(row) };
}

/** Optional text fields may arrive as "" — store NULL instead. */
function blankToNull(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === '' ? null : value;
}

/** Date equality for diff tracking (null-safe, value-based). */
function sameDate(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}

/**
 * Parses stored JSON blocks into the typed registry. Unknown block types and
 * malformed blocks are skipped and logged (spec 6.11) — a bad stored row must
 * never take the page endpoint down with a 500.
 */
export function parseBlocks(slug: string, stored: unknown): CmsBlock[] {
  if (!Array.isArray(stored)) {
    if (stored !== null && stored !== undefined) {
      logger.warn({ slug }, 'cms: blocks column is not an array — serving no blocks');
    }
    return [];
  }
  const blocks: CmsBlock[] = [];
  stored.forEach((raw, index) => {
    const parsed = CmsBlockSchema.safeParse(raw);
    if (parsed.success) {
      blocks.push(parsed.data);
    } else {
      const type =
        typeof raw === 'object' && raw !== null && 'type' in raw && typeof raw.type === 'string'
          ? raw.type
          : typeof raw;
      logger.warn({ slug, index, type }, 'cms: ignoring unknown or malformed block (spec 6.11)');
    }
  });
  return blocks;
}

function toCmsPageDto(row: CmsPage): CmsPageDto {
  return {
    slug: row.slug,
    title: row.title,
    blocks: parseBlocks(row.slug, row.blocks),
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function mustFindBanner(id: string, tx: Transaction): Promise<BannerRow> {
  const row = await cmsRepository.findById(id, tx);
  if (!row) throw notFound('Banner not found');
  return row;
}

// ── public reads ────────────────────────────────────────────────────────────

/**
 * GET /cms/home — every placement's banners (one query, window-filtered,
 * sortOrder-ordered), the top-level category tiles and SEO. Cached 5 min under
 * 'cms:home'; every admin write invalidates the whole 'cms:' prefix.
 */
async function home(): Promise<HomeDto> {
  return cache.wrap(CMS_HOME_CACHE_KEY, CMS_CACHE_TTL_MS, async () => {
    const now = new Date();
    const banners = await cmsRepository.listVisibleBanners(
      ['HOME_HERO', 'HOME_SIDE_TOP', 'HOME_SIDE_BOTTOM', 'HOME_HIGHLIGHT'],
      now,
    );
    const byPlacement = (placement: BannerPlacementName): BannerDto[] =>
      banners.filter((b) => b.placement === placement).map(toBannerDto);

    const categoryTiles: HomeCategoryTile[] = (await cmsRepository.listRootCategories()).map((c) => ({
      name: c.name,
      slug: c.slug,
      code: c.code,
      pathSlugs: c.pathSlugs,
      productCount: c.productCount,
      image: mediaUrl(c.imagePublicId ?? c.iconPublicId),
    }));

    const homeSeo = await cmsRepository.findPublishedPageBySlug(HOME_SEO_PAGE_SLUG);
    return {
      heroes: byPlacement('HOME_HERO'),
      sideTop: byPlacement('HOME_SIDE_TOP'),
      sideBottom: byPlacement('HOME_SIDE_BOTTOM'),
      highlights: byPlacement('HOME_HIGHLIGHT'),
      categoryTiles,
      quickOrderTeaser: null,
      seoTitle: homeSeo?.seoTitle ?? HOME_SEO_DEFAULTS.seoTitle,
      seoDescription: homeSeo?.seoDescription ?? HOME_SEO_DEFAULTS.seoDescription,
    };
  });
}

/** GET /cms/pages/:slug — PUBLISHED only; drafts are indistinguishable from missing. */
async function pageBySlug(slug: string): Promise<CmsPageDto> {
  const row = await cmsRepository.findPageBySlug(slug);
  if (!row || row.status !== 'PUBLISHED') throw notFound('CMS page not found');
  return toCmsPageDto(row);
}

/** GET /banners?placement= — active, in-window banners of one placement. */
async function listBanners(placement: BannerPlacementName): Promise<BannerDto[]> {
  const rows = await cmsRepository.listVisibleBanners([placement], new Date());
  return rows.map(toBannerDto);
}

// ── admin writes (authenticate + authorize('STAFF','ADMIN') applied on the router) ──

/** POST /admin/banners — 201; window fields optional (null = unbounded). */
async function createBanner(actorId: string, input: CreateBannerInput, ip: string | null): Promise<AdminBannerDto> {
  const row = await withTransaction(async (tx) => {
    const created = await cmsRepository.createBanner(
      {
        placement: input.placement,
        eyebrow: blankToNull(input.eyebrow),
        heading: input.heading,
        subheading: blankToNull(input.subheading),
        ctaLabel: blankToNull(input.ctaLabel),
        ctaHref: blankToNull(input.ctaHref),
        imagePublicId: input.imagePublicId,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
      },
      tx,
    );
    await writeAudit(
      actorId,
      'banner.create',
      'banner',
      created.id,
      { placement: input.placement, heading: input.heading },
      ip,
      tx,
    );
    return created;
  });
  cache.deletePrefix('cms:');
  scheduleRevalidate([TAGS.home]);
  return toAdminBannerDto(row);
}

/** PATCH /admin/banners/:id — partial update with a field-level audit diff. */
async function updateBanner(
  actorId: string,
  id: string,
  input: UpdateBannerInput,
  ip: string | null,
): Promise<AdminBannerDto> {
  const row = await withTransaction(async (tx) => {
    const current = await mustFindBanner(id, tx);
    const data: Prisma.BannerUncheckedUpdateInput = {};
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    const track = (field: string, from: unknown, to: unknown): void => {
      (data as Record<string, unknown>)[field] = to;
      diff[field] = { from, to };
    };

    if (input.placement !== undefined && input.placement !== current.placement) {
      track('placement', current.placement, input.placement);
    }
    if (input.heading !== undefined && input.heading !== current.heading) {
      track('heading', current.heading, input.heading);
    }
    if (input.eyebrow !== undefined) {
      const v = blankToNull(input.eyebrow);
      if (v !== current.eyebrow) track('eyebrow', current.eyebrow, v);
    }
    if (input.subheading !== undefined) {
      const v = blankToNull(input.subheading);
      if (v !== current.subheading) track('subheading', current.subheading, v);
    }
    if (input.ctaLabel !== undefined) {
      const v = blankToNull(input.ctaLabel);
      if (v !== current.ctaLabel) track('ctaLabel', current.ctaLabel, v);
    }
    if (input.ctaHref !== undefined) {
      const v = blankToNull(input.ctaHref);
      if (v !== current.ctaHref) track('ctaHref', current.ctaHref, v);
    }
    if (input.imagePublicId !== undefined && input.imagePublicId !== current.imagePublicId) {
      track('imagePublicId', current.imagePublicId, input.imagePublicId);
    }
    if (input.sortOrder !== undefined && input.sortOrder !== current.sortOrder) {
      track('sortOrder', current.sortOrder, input.sortOrder);
    }
    if (input.isActive !== undefined && input.isActive !== current.isActive) {
      track('isActive', current.isActive, input.isActive);
    }
    if (input.startsAt !== undefined) {
      const v = input.startsAt ?? null;
      if (!sameDate(v, current.startsAt)) track('startsAt', current.startsAt, v);
    }
    if (input.endsAt !== undefined) {
      const v = input.endsAt ?? null;
      if (!sameDate(v, current.endsAt)) track('endsAt', current.endsAt, v);
    }

    const updated = Object.keys(data).length > 0 ? await cmsRepository.updateBannerById(id, data, tx) : current;
    await writeAudit(actorId, 'banner.update', 'banner', id, diff, ip, tx);
    return updated;
  });
  cache.deletePrefix('cms:');
  scheduleRevalidate([TAGS.home]);
  return toAdminBannerDto(row);
}

/** DELETE /admin/banners/:id — hard delete (Banner has no soft-delete columns). */
async function deleteBanner(actorId: string, id: string, ip: string | null): Promise<void> {
  await withTransaction(async (tx) => {
    const current = await mustFindBanner(id, tx);
    await cmsRepository.deleteBannerById(id, tx);
    await writeAudit(actorId, 'banner.delete', 'banner', id, { heading: current.heading }, ip, tx);
  });
  cache.deletePrefix('cms:');
  scheduleRevalidate([TAGS.home]);
}

/**
 * POST /admin/cms/pages — upsert by slug (create → 201, update → 200); the
 * caller gets `{ page, created }` so the controller can pick the status code.
 */
async function upsertPage(
  actorId: string,
  input: SaveCmsPageInput,
  ip: string | null,
): Promise<{ page: CmsPageDto; created: boolean }> {
  const row = await withTransaction(async (tx) => {
    const existing = await cmsRepository.findPageBySlug(input.slug, tx);
    const base = {
      title: input.title,
      blocks: input.blocks as unknown as Prisma.InputJsonValue,
      seoTitle: blankToNull(input.seoTitle),
      seoDescription: blankToNull(input.seoDescription),
      status: input.status,
    };
    const saved = existing
      ? await cmsRepository.updatePageBySlug(input.slug, base, tx)
      : await cmsRepository.createPage({ slug: input.slug, ...base }, tx);
    await writeAudit(
      actorId,
      existing ? 'cms_page.update' : 'cms_page.create',
      'cms_page',
      saved.id,
      { slug: input.slug, created: existing === null, status: input.status, blockCount: input.blocks.length },
      ip,
      tx,
    );
    return { row: saved, created: existing === null };
  });
  cache.deletePrefix('cms:');
  scheduleRevalidate([TAGS.home, TAGS.cms(input.slug)]);
  return { page: toCmsPageDto(row.row), created: row.created };
}

/** PATCH /admin/cms/pages/:slug — partial update by slug; 404 when unknown. */
async function updatePage(actorId: string, slug: string, input: UpdateCmsPageInput, ip: string | null): Promise<CmsPageDto> {
  const row = await withTransaction(async (tx) => {
    const current = await cmsRepository.findPageBySlug(slug, tx);
    if (!current) throw notFound('CMS page not found');

    const data: Prisma.CmsPageUncheckedUpdateInput = {};
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    const track = (field: string, from: unknown, to: unknown): void => {
      (data as Record<string, unknown>)[field] = to;
      diff[field] = { from, to };
    };

    if (input.title !== undefined && input.title !== current.title) {
      track('title', current.title, input.title);
    }
    if (input.blocks !== undefined) {
      // Keep the audit row light: block payloads are large, log counts instead.
      diff.blocks = { from: parseBlocks(slug, current.blocks).length, to: input.blocks.length };
      data.blocks = input.blocks as unknown as Prisma.InputJsonValue;
    }
    if (input.seoTitle !== undefined) {
      const v = blankToNull(input.seoTitle);
      if (v !== current.seoTitle) track('seoTitle', current.seoTitle, v);
    }
    if (input.seoDescription !== undefined) {
      const v = blankToNull(input.seoDescription);
      if (v !== current.seoDescription) track('seoDescription', current.seoDescription, v);
    }
    if (input.status !== undefined && input.status !== current.status) {
      track('status', current.status, input.status);
    }

    const updated = Object.keys(data).length > 0 ? await cmsRepository.updatePageBySlug(slug, data, tx) : current;
    await writeAudit(actorId, 'cms_page.update', 'cms_page', updated.id, diff, ip, tx);
    return updated;
  });
  cache.deletePrefix('cms:');
  scheduleRevalidate([TAGS.home, TAGS.cms(slug)]);
  return toCmsPageDto(row);
}

export const cmsService = {
  home,
  pageBySlug,
  listBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  upsertPage,
  updatePage,
};
