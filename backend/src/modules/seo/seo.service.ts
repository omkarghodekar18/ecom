// SEO service — sitemap chunk feed (spec Section 13): one 1-based page stream
// per entity type, max 45,000 URLs per chunk (the sitemap protocol's per-file
// budget, with headroom). Read-only reporting over the public catalog surface —
// no write path exists, so prisma lives here directly (health-module precedent)
// and there is no repository/controller split to justify.
//
// `loc` values are storefront paths (locale-prefixed `/in/en/…`, no origin) and
// MUST stay byte-compatible with the frontend URL builders in
// `frontend/src/config/routes.ts` — search engines index what links emit.
import { Prisma } from '@prisma/client';
import { notFound } from '../../common/errors/app-error.js';
import { prisma } from '../../db/prisma.js';
import { ACTIVE_CATEGORY } from '../catalog/catalog.repository.js';
import { PUBLISHED_PRODUCT } from '../products/products.repository.js';
import type { SitemapChunkDto, SitemapIndexDto, SitemapType, SitemapUrl } from '../../shared/dto/seo.dto.js';

/** Max URLs per chunk — 45,000 (protocol hard limit is 50,000; headroom kept). */
export const SITEMAP_PAGE_SIZE = 45_000;

/** Storefront locale base used by every sitemap `loc`. */
const LOCALE_BASE = '/in/en';

/** At least one page per stream, even when empty (chunk 1 = empty list). */
function totalPagesFor(total: number): number {
  return Math.max(1, Math.ceil(total / SITEMAP_PAGE_SIZE));
}

function assertPageInRange(page: number, totalPages: number): void {
  if (page > totalPages) {
    throw notFound(`Sitemap page ${page} is out of range (${totalPages} page${totalPages === 1 ? '' : 's'})`);
  }
}

/**
 * Article numbers contain spaces/commas ("111100 0,5"); URLs need a slug form.
 * Mirrors `slugifyArticleNo` in frontend/src/config/routes.ts exactly — a
 * divergent copy would mint URLs no storefront link ever points at.
 */
export function slugifyArticleNo(articleNo: string): string {
  return articleNo
    .trim()
    .toLowerCase()
    .replace(/,/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

// ── per-type chunk builders ──────────────────────────────────────────────────

async function categoriesChunk(page: number): Promise<SitemapChunkDto> {
  const total = await prisma.category.count({ where: ACTIVE_CATEGORY });
  const totalPages = totalPagesFor(total);
  assertPageInRange(page, totalPages);
  const rows = await prisma.category.findMany({
    where: ACTIVE_CATEGORY,
    select: { pathSlugs: true, code: true, updatedAt: true },
    orderBy: { id: 'asc' },
    skip: (page - 1) * SITEMAP_PAGE_SIZE,
    take: SITEMAP_PAGE_SIZE,
  });
  const urls: SitemapUrl[] = rows.map((r) => ({
    loc: `${LOCALE_BASE}/${r.pathSlugs}/c/${r.code}`,
    updatedAt: r.updatedAt.toISOString(),
  }));
  return { type: 'categories', page, totalPages, urls };
}

/**
 * Product URLs seed with the FIRST visible variant's articleNo (sortOrder, then
 * articleNo — the PDP ordering). The per-product first variant comes from ONE
 * `DISTINCT ON` query restricted to the chunk's product ids, never the whole
 * Variant table, so chunking stays scale-safe. Products without a visible
 * variant fall back to the bare slug.
 */
async function productsChunk(page: number): Promise<SitemapChunkDto> {
  const total = await prisma.product.count({ where: PUBLISHED_PRODUCT });
  const totalPages = totalPagesFor(total);
  assertPageInRange(page, totalPages);
  const rows = await prisma.product.findMany({
    where: PUBLISHED_PRODUCT,
    select: { id: true, slug: true, updatedAt: true },
    orderBy: { id: 'asc' },
    skip: (page - 1) * SITEMAP_PAGE_SIZE,
    take: SITEMAP_PAGE_SIZE,
  });
  const firstArticleNos = await firstArticleNoByProduct(rows.map((r) => r.id));
  const urls: SitemapUrl[] = rows.map((r) => {
    const articleNo = firstArticleNos.get(r.id);
    const suffix = articleNo === undefined ? '' : `-${slugifyArticleNo(articleNo)}`;
    return { loc: `${LOCALE_BASE}/p/${r.slug}${suffix}`, updatedAt: r.updatedAt.toISOString() };
  });
  return { type: 'products', page, totalPages, urls };
}

/** productId → first visible variant articleNo for the given (chunk-sized) id set. */
async function firstArticleNoByProduct(productIds: string[]): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<Array<{ productId: string; articleNo: string }>>`
    SELECT DISTINCT ON ("productId") "productId", "articleNo"
    FROM "Variant"
    WHERE "deletedAt" IS NULL AND "isActive" = true
      AND "productId" IN (${Prisma.join(productIds)})
    ORDER BY "productId", "sortOrder", "articleNo"`;
  return new Map(rows.map((r) => [r.productId, r.articleNo]));
}

async function brandsChunk(page: number): Promise<SitemapChunkDto> {
  const total = await prisma.brand.count();
  const totalPages = totalPagesFor(total);
  assertPageInRange(page, totalPages);
  const rows = await prisma.brand.findMany({
    select: { slug: true },
    orderBy: { id: 'asc' },
    skip: (page - 1) * SITEMAP_PAGE_SIZE,
    take: SITEMAP_PAGE_SIZE,
  });
  // Brand rows carry no timestamps in the schema — no lastmod for this stream.
  const urls: SitemapUrl[] = rows.map((r) => ({ loc: `${LOCALE_BASE}/brands/${r.slug}`, updatedAt: null }));
  return { type: 'brands', page, totalPages, urls };
}

async function cmsChunk(page: number): Promise<SitemapChunkDto> {
  const total = await prisma.cmsPage.count({ where: { status: 'PUBLISHED' } });
  const totalPages = totalPagesFor(total);
  assertPageInRange(page, totalPages);
  const rows = await prisma.cmsPage.findMany({
    where: { status: 'PUBLISHED' },
    select: { slug: true, updatedAt: true },
    orderBy: { id: 'asc' },
    skip: (page - 1) * SITEMAP_PAGE_SIZE,
    take: SITEMAP_PAGE_SIZE,
  });
  const urls: SitemapUrl[] = rows.map((r) => ({
    loc: `${LOCALE_BASE}/e/${r.slug}`,
    updatedAt: r.updatedAt.toISOString(),
  }));
  return { type: 'cms', page, totalPages, urls };
}

// ── public reads ────────────────────────────────────────────────────────────

/** GET /seo/sitemap/index — which streams exist and how many chunks each has. */
async function sitemapIndex(): Promise<SitemapIndexDto> {
  const [categories, products, brands, cms] = await Promise.all([
    prisma.category.count({ where: ACTIVE_CATEGORY }),
    prisma.product.count({ where: PUBLISHED_PRODUCT }),
    prisma.brand.count(),
    prisma.cmsPage.count({ where: { status: 'PUBLISHED' } }),
  ]);
  return {
    types: [
      { type: 'categories', totalPages: totalPagesFor(categories) },
      { type: 'products', totalPages: totalPagesFor(products) },
      { type: 'brands', totalPages: totalPagesFor(brands) },
      { type: 'cms', totalPages: totalPagesFor(cms) },
    ],
  };
}

/** GET /seo/sitemap/:type/:page — one chunk of one stream (1-based pages). */
async function sitemapChunk(type: SitemapType, page: number): Promise<SitemapChunkDto> {
  switch (type) {
    case 'categories':
      return categoriesChunk(page);
    case 'products':
      return productsChunk(page);
    case 'brands':
      return brandsChunk(page);
    case 'cms':
      return cmsChunk(page);
  }
}

export const seoService = {
  sitemapIndex,
  sitemapChunk,
};
