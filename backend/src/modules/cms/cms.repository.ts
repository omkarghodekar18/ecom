// CMS repository — banners, CMS pages and the home tile feed (top-level
// categories). Takes an optional tx client for transactional writes.
import type { Prisma, Banner, BannerPlacement, CmsPage } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { Transaction } from '../../db/transaction-types.js';

export type BannerRow = Banner;
export type CmsPageRow = CmsPage;

function db(tx?: Transaction): Transaction {
  return tx ?? prisma;
}

/**
 * Public banner visibility: active AND inside the optional scheduling window
 * (null startsAt/endsAt mean "unbounded" — Prisma comparisons on NULL exclude
 * rows, so each bound needs its explicit null branch).
 */
export function bannerWindowFilter(now: Date): Prisma.BannerWhereInput {
  return {
    AND: [
      { isActive: true },
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ],
  };
}

/** Columns the home category-tile row needs. */
const rootCategorySelect = {
  name: true,
  slug: true,
  code: true,
  pathSlugs: true,
  productCount: true,
  imagePublicId: true,
  iconPublicId: true,
} satisfies Prisma.CategorySelect;

export type RootCategoryTileRow = Prisma.CategoryGetPayload<{ select: typeof rootCategorySelect }>;

export const cmsRepository = {
  /** Active, in-window banners for the given placements, ordered for display. */
  listVisibleBanners(placements: BannerPlacement[], now: Date, tx?: Transaction): Promise<BannerRow[]> {
    return db(tx).banner.findMany({
      where: { placement: { in: placements }, ...bannerWindowFilter(now) },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  },

  findById(id: string, tx?: Transaction): Promise<BannerRow | null> {
    return db(tx).banner.findUnique({ where: { id } });
  },

  createBanner(data: Prisma.BannerUncheckedCreateInput, tx?: Transaction): Promise<BannerRow> {
    return db(tx).banner.create({ data });
  },

  updateBannerById(id: string, data: Prisma.BannerUncheckedUpdateInput, tx?: Transaction): Promise<BannerRow> {
    return db(tx).banner.update({ where: { id }, data });
  },

  deleteBannerById(id: string, tx?: Transaction): Promise<unknown> {
    return db(tx).banner.delete({ where: { id } });
  },

  /** Top-level active categories for the home tile row (ordered by sortOrder). */
  listRootCategories(tx?: Transaction): Promise<RootCategoryTileRow[]> {
    return db(tx).category.findMany({
      where: { parentId: null, deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: rootCategorySelect,
    });
  },

  findPageBySlug(slug: string, tx?: Transaction): Promise<CmsPageRow | null> {
    return db(tx).cmsPage.findUnique({ where: { slug } });
  },

  /** Only PUBLISHED pages count (e.g. the home-SEO override lookup). */
  findPublishedPageBySlug(slug: string, tx?: Transaction): Promise<CmsPageRow | null> {
    return db(tx).cmsPage.findFirst({ where: { slug, status: 'PUBLISHED' } });
  },

  createPage(data: Prisma.CmsPageUncheckedCreateInput, tx?: Transaction): Promise<CmsPageRow> {
    return db(tx).cmsPage.create({ data });
  },

  updatePageBySlug(slug: string, data: Prisma.CmsPageUncheckedUpdateInput, tx?: Transaction): Promise<CmsPageRow> {
    return db(tx).cmsPage.update({ where: { slug }, data });
  },
};
