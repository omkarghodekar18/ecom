// Pricing repository — the only layer touching Prisma in the pricing module:
// publicly visible variants by id (with their ordered tier prices) and the
// company-specific customer prices inside their validity window. Read-only;
// methods take an optional tx client like every other repository.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { Transaction } from '../../db/transaction-types.js';

/** Variant row the resolver needs: pricing scalars + ordered tier prices. */
const pricingVariantInclude = {
  priceTiers: { orderBy: { minQty: 'asc' } },
} satisfies Prisma.VariantInclude;

export type PricingVariantRow = Prisma.VariantGetPayload<{ include: typeof pricingVariantInclude }>;

function db(tx?: Transaction): Transaction {
  return tx ?? prisma;
}

export const pricingRepository = {
  /**
   * Publicly visible variants by id (PUBLISHED, non-deleted product; active,
   * non-deleted variant). Callers detect unknown/invisible ids by difference.
   */
  findVariantsByIds(variantIds: string[], tx?: Transaction): Promise<PricingVariantRow[]> {
    return db(tx).variant.findMany({
      where: {
        id: { in: variantIds },
        deletedAt: null,
        isActive: true,
        product: { deletedAt: null, status: 'PUBLISHED' },
      },
      include: pricingVariantInclude,
    });
  },

  /** companyId of the caller's B2B account (null for guests, B2C or unknown users). */
  async findCompanyIdForUser(userId: string, tx?: Transaction): Promise<string | null> {
    const user = await db(tx).user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    return user?.companyId ?? null;
  },

  /**
   * Publicly visible variants by exact article numbers (quick-order / CSV
   * import lookups; callers pre-expand user input into candidates).
   */
  findVariantsByArticleNos(articleNos: string[], tx?: Transaction): Promise<PricingVariantRow[]> {
    if (articleNos.length === 0) return Promise.resolve([]);
    return db(tx).variant.findMany({
      where: {
        articleNo: { in: articleNos },
        deletedAt: null,
        isActive: true,
        product: { deletedAt: null, status: 'PUBLISHED' },
      },
      include: pricingVariantInclude,
    });
  },

  /**
   * Customer prices for one company keyed by variantId — only rows whose
   * validFrom/validTo window includes `now` (NULL bounds are open-ended).
   * (companyId, variantId) is unique, so the map never collides.
   */
  async findCustomerPrices(
    companyId: string,
    variantIds: string[],
    tx?: Transaction,
  ): Promise<Map<string, Prisma.Decimal>> {
    const now = new Date();
    const rows = await db(tx).customerPrice.findMany({
      where: {
        companyId,
        variantId: { in: variantIds },
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validTo: null }, { validTo: { gte: now } }] },
        ],
      },
      select: { variantId: true, price: true },
    });
    return new Map(rows.map((row) => [row.variantId, row.price]));
  },
};
