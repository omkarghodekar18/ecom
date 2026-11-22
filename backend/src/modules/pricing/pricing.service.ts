// Pricing service — effective unit prices for a set of variant lines (the
// spec 15.x price ladder): a valid customer price for the caller's company
// wins; otherwise the tier with the highest minQty ≤ quantity; otherwise the
// variant's list price. `resolveUnitPrice` is PURE (no I/O); `resolveForUser`
// is the request-facing flow that loads the variants and the caller's prices.
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { ERR } from '../../config/constants.js';
import type { ResolvedPriceDto } from '../../shared/dto/product.dto.js';
import { pricingRepository } from './pricing.repository.js';

// ── input contract ───────────────────────────────────────────────────────────

/** Body of POST /pricing/resolve — one line per variant to price. */
export const ResolvePricesInputSchema = z.object({
  lines: z
    .array(
      z.object({
        variantId: z.string().min(1),
        quantity: z.number().int().positive().max(100_000),
      }),
    )
    .min(1)
    .max(100),
});
export type ResolvePricesInput = z.infer<typeof ResolvePricesInputSchema>;
export type PriceLine = ResolvePricesInput['lines'][number];

// ── pure resolution ──────────────────────────────────────────────────────────

/** Price inputs every variant carries (Prisma Decimal or a decimal string). */
export interface PriceSource {
  listPrice: Prisma.Decimal | string;
  priceTiers: Array<{ minQty: number; price: Prisma.Decimal | string }>;
}

export type PriceBasis = 'customer' | 'tier' | 'list';

export interface ResolvedUnitPrice {
  /** 2-decimal money string (money travels as strings in this API). */
  unitPrice: string;
  basis: PriceBasis;
}

/**
 * The price ladder, pure and I/O-free: a non-null customerPrice always wins;
 * otherwise the tier with the highest minQty ≤ quantity; otherwise the list
 * price. Ties between tiers are impossible (minQty is unique per variant).
 */
export function resolveUnitPrice(
  variant: PriceSource,
  customerPrice: Prisma.Decimal | string | null,
  quantity: number,
): ResolvedUnitPrice {
  if (customerPrice !== null) {
    return { unitPrice: new Prisma.Decimal(customerPrice).toFixed(2), basis: 'customer' };
  }
  let applied: PriceSource['priceTiers'][number] | null = null;
  for (const tier of variant.priceTiers) {
    if (tier.minQty <= quantity && (applied === null || tier.minQty > applied.minQty)) {
      applied = tier;
    }
  }
  if (applied !== null) {
    return { unitPrice: new Prisma.Decimal(applied.price).toFixed(2), basis: 'tier' };
  }
  return { unitPrice: new Prisma.Decimal(variant.listPrice).toFixed(2), basis: 'list' };
}

// ── request flow ─────────────────────────────────────────────────────────────

/**
 * Resolves every line for the caller: guests (userId null) get list/tier
 * prices, a signed-in B2B user additionally gets their company's customer
 * prices (validity window including now). Unknown or invisible variantIds →
 * 404 with the offending ids. Returns one ResolvedPriceDto per line, order
 * preserved.
 */
export async function resolveForUser(lines: PriceLine[], userId: string | null): Promise<ResolvedPriceDto[]> {
  const variantIds = [...new Set(lines.map((line) => line.variantId))];
  const variants = await pricingRepository.findVariantsByIds(variantIds);
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const missing = variantIds.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    // notFound() carries no details slot; the offending ids matter to callers.
    throw new AppError(ERR.NOT_FOUND, 'Variant not found', 404, { variantIds: missing });
  }

  const companyId = userId !== null ? await pricingRepository.findCompanyIdForUser(userId) : null;
  const customerPrices =
    companyId !== null
      ? await pricingRepository.findCustomerPrices(companyId, variantIds)
      : new Map<string, Prisma.Decimal>();

  return lines.map((line) => {
    const variant = byId.get(line.variantId);
    if (variant === undefined) throw new AppError(ERR.NOT_FOUND, 'Variant not found', 404); // guarded above
    const { unitPrice, basis } = resolveUnitPrice(
      variant,
      customerPrices.get(line.variantId) ?? null,
      line.quantity,
    );
    return {
      variantId: line.variantId,
      articleNo: variant.articleNo,
      quantity: line.quantity,
      unitPrice,
      basis,
      listPrice: variant.listPrice.toFixed(2),
    };
  });
}

export const pricingService = { resolveForUser };
