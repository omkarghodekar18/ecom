// Quick-order repository — article-number lookups with product context for the
// quick-entry UI (image, name, brand). Same visibility rule as everywhere else:
// published product, active, non-deleted variant.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { Transaction } from '../../db/transaction-types.js';

const include = {
  product: {
    select: {
      name: true,
      slug: true,
      status: true,
      deletedAt: true,
      brand: { select: { name: true } },
      images: { orderBy: { sortOrder: 'asc' as const }, take: 1 },
    },
  },
} satisfies Prisma.VariantInclude;

export type QuickOrderVariantRow = Prisma.VariantGetPayload<{ include: typeof include }>;

export const quickOrderRepository = {
  /** Publicly visible variants by exact article numbers. */
  findByArticleNos(articleNos: string[], tx?: Transaction): Promise<QuickOrderVariantRow[]> {
    if (articleNos.length === 0) return Promise.resolve([]);
    return db(tx).variant.findMany({
      where: {
        articleNo: { in: articleNos },
        deletedAt: null,
        isActive: true,
        product: { deletedAt: null, status: 'PUBLISHED' },
      },
      include,
    });
  },
};

function db(tx?: Transaction): Transaction {
  return tx ?? prisma;
}
