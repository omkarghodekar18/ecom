// Brands repository — brand reads/writes plus the product-count groupBy the
// public listing carries. Takes an optional tx client for transactional writes.
import type { Prisma } from '@prisma/client';
import type { Brand } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { Transaction } from '../../db/transaction-types.js';

export type BrandRow = Brand;

function db(tx?: Transaction): Transaction {
  return tx ?? prisma;
}

export const brandsRepository = {
  /** Brands with PUBLISHED, non-deleted product counts (computed via groupBy on Product). */
  async listWithProductCounts(tx?: Transaction): Promise<Array<BrandRow & { productCount: number }>> {
    const grouped = await db(tx).product.groupBy({
      by: ['brandId'],
      where: { deletedAt: null, status: 'PUBLISHED' },
      _count: { _all: true },
    });
    const counts = new Map(grouped.map((g) => [g.brandId, g._count._all]));
    const brands = await db(tx).brand.findMany({ orderBy: [{ name: 'asc' }] });
    return brands.map((b) => ({ ...b, productCount: counts.get(b.id) ?? 0 }));
  },

  findBySlug(slug: string, tx?: Transaction): Promise<BrandRow | null> {
    return db(tx).brand.findUnique({ where: { slug } });
  },

  findById(id: string, tx?: Transaction): Promise<BrandRow | null> {
    return db(tx).brand.findUnique({ where: { id } });
  },

  findByName(name: string, tx?: Transaction): Promise<BrandRow | null> {
    return db(tx).brand.findUnique({ where: { name } });
  },

  slugTaken(slug: string, excludeId: string | null, tx?: Transaction): Promise<boolean> {
    return db(tx)
      .brand.findFirst({
        where: { slug, ...(excludeId !== null ? { id: { not: excludeId } } : {}) },
        select: { id: true },
      })
      .then((row) => row !== null);
  },

  /** Any product row referencing the brand (delete guard — includes drafts/deleted). */
  countProducts(brandId: string, tx?: Transaction): Promise<number> {
    return db(tx).product.count({ where: { brandId } });
  },

  create(data: Prisma.BrandUncheckedCreateInput, tx?: Transaction): Promise<BrandRow> {
    return db(tx).brand.create({ data });
  },

  updateById(id: string, data: Prisma.BrandUncheckedUpdateInput, tx?: Transaction): Promise<BrandRow> {
    return db(tx).brand.update({ where: { id }, data });
  },

  deleteById(id: string, tx?: Transaction): Promise<unknown> {
    return db(tx).brand.delete({ where: { id } });
  },
};
