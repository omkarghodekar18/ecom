// Catalog repository — the only layer touching Prisma for categories in this
// module. Public reads scope to ACTIVE, non-deleted rows; admin write helpers
// take an optional tx client so services can compose atomic multi-step flows
// (path rewrites, slug redirects) via `withTransaction`.
import type { Brand, Category, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { Transaction } from '../../db/transaction-types.js';

export type CategoryRow = Category;
export type BrandRow = Brand;

/** Public visibility filter for categories (spec 15.1: active + not soft-deleted). */
export const ACTIVE_CATEGORY: Prisma.CategoryWhereInput = { isActive: true, deletedAt: null };

function db(tx?: Transaction): Transaction {
  return tx ?? prisma;
}

/**
 * Prisma where matching a category's whole subtree INCLUDING itself.
 * `path` is materialised ids with a trailing slash per level ("/rootId/childId/"),
 * so a plain prefix match is exact: "/idA/" can never prefix-match "/idA2/".
 * The raw-SQL equivalent is `path LIKE '/idA/%'`.
 */
export function subtreeWhere(category: Pick<Category, 'path'>): Prisma.CategoryWhereInput {
  return { path: { startsWith: category.path } };
}

export const catalogRepository = {
  // ── public reads ────────────────────────────────────────────────────────

  /** One active, non-deleted category by its unique code (public 404 scope). */
  findActiveByCode(code: string, tx?: Transaction): Promise<CategoryRow | null> {
    return db(tx).category.findFirst({ where: { code, ...ACTIVE_CATEGORY } });
  },

  /** All active categories up to `maxLevel`, parents before children. */
  listActiveUpToLevel(maxLevel: number, tx?: Transaction): Promise<CategoryRow[]> {
    return db(tx).category.findMany({
      where: { ...ACTIVE_CATEGORY, level: { lte: maxLevel } },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  },

  /** Immediate active children, ordered for display. */
  listActiveChildren(parentId: string, tx?: Transaction): Promise<CategoryRow[]> {
    return db(tx).category.findMany({
      where: { parentId, ...ACTIVE_CATEGORY },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  },

  findManyByIds(ids: string[], tx?: Transaction): Promise<CategoryRow[]> {
    return db(tx).category.findMany({ where: { id: { in: ids } } });
  },

  /**
   * Brands with product counts inside a category subtree (incl. self) —
   * consumed by the products module listing facets. Counts PUBLISHED,
   * non-deleted products only, mirroring the category counts job.
   */
  async listBrandsForSubtree(
    category: Pick<Category, 'path'>,
    tx?: Transaction,
  ): Promise<Array<BrandRow & { productCount: number }>> {
    const grouped = await db(tx).product.groupBy({
      by: ['brandId'],
      where: {
        deletedAt: null,
        status: 'PUBLISHED',
        category: { path: { startsWith: category.path } },
      },
      _count: { _all: true },
    });
    const counts = new Map(grouped.map((g) => [g.brandId, g._count._all]));
    const ids = [...counts.keys()];
    const brands =
      ids.length > 0
        ? await db(tx).brand.findMany({ where: { id: { in: ids } }, orderBy: { name: 'asc' } })
        : [];
    return brands.map((b) => ({ ...b, productCount: counts.get(b.id) ?? 0 }));
  },

  // ── admin reads (any state) ─────────────────────────────────────────────

  findById(id: string, tx?: Transaction): Promise<CategoryRow | null> {
    return db(tx).category.findUnique({ where: { id } });
  },

  findByCode(code: string, tx?: Transaction): Promise<CategoryRow | null> {
    return db(tx).category.findUnique({ where: { code } });
  },

  /** Whole subtree incl. self, parents before children (path asc). */
  listSubtree(category: CategoryRow, tx?: Transaction): Promise<CategoryRow[]> {
    return db(tx).category.findMany({ where: subtreeWhere(category), orderBy: { path: 'asc' } });
  },

  /** Non-deleted products directly in this category (delete guard, any status). */
  countActiveProducts(categoryId: string, tx?: Transaction): Promise<number> {
    return db(tx).product.count({ where: { categoryId, deletedAt: null } });
  },

  /** Non-deleted children (delete guard — an inactive-but-live child still blocks). */
  countLiveChildren(categoryId: string, tx?: Transaction): Promise<number> {
    return db(tx).category.count({ where: { parentId: categoryId, deletedAt: null } });
  },

  slugTaken(slug: string, excludeId: string | null, tx?: Transaction): Promise<boolean> {
    return db(tx)
      .category.findFirst({
        where: { slug, ...(excludeId !== null ? { id: { not: excludeId } } : {}) },
        select: { id: true },
      })
      .then((row) => row !== null);
  },

  // ── writes ──────────────────────────────────────────────────────────────

  create(data: Prisma.CategoryUncheckedCreateInput, tx?: Transaction): Promise<CategoryRow> {
    return db(tx).category.create({ data });
  },

  updateById(id: string, data: Prisma.CategoryUncheckedUpdateInput, tx?: Transaction): Promise<CategoryRow> {
    return db(tx).category.update({ where: { id }, data });
  },

  /** Upserts one CATEGORY slug redirect (spec 13.6; oldPath is unique). */
  upsertSlugRedirect(oldPath: string, newPath: string, tx?: Transaction): Promise<unknown> {
    return db(tx).slugRedirect.upsert({
      where: { oldPath },
      create: { type: 'CATEGORY', oldPath, newPath },
      update: { newPath },
    });
  },
};
