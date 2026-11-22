// Pure cart rules (spec Section 11): quantity normalisation (minOrderQty,
// packSize multiples, stock policy), totals computation and stock warnings.
// No I/O — every function is directly unit-testable and reused by cart,
// checkout and quick-order.
import { Prisma } from '@prisma/client';
import type { CartTotalsDto, CartWarningDto } from '../../shared/dto/cart.dto.js';
import type { StockPolicy } from '../../services/settings/settings.service.js';

/** Quantity-rule inputs straight off a variant row. */
export interface QuantityRuleSource {
  minOrderQty: number;
  packSize: number;
  stockQty: number;
  articleNo?: string;
}

const MAX_QTY = 100_000;

export class QuantityRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'QuantityRuleError';
  }
}

/**
 * Normalises a requested quantity onto the variant's commercial grid:
 * at least minOrderQty, a packSize multiple, and — under STOCK_ONLY — never
 * above the shelf. Adjustments are reported as warnings; only an
 * un-shippable line (STOCK_ONLY with no stock) throws.
 */
export function applyQuantityRules(
  requested: number,
  variant: QuantityRuleSource,
  policy: StockPolicy,
): { quantity: number; warnings: CartWarningDto[] } {
  const warnings: CartWarningDto[] = [];
  let quantity = Math.min(Math.max(Math.trunc(requested), 1), MAX_QTY);

  if (quantity < variant.minOrderQty) {
    quantity = variant.minOrderQty;
    warnings.push({
      code: 'QTY_ADJUSTED_MIN_ORDER',
      message: `Quantity raised to the minimum order quantity of ${variant.minOrderQty}.`,
      variantId: null,
    });
  }
  const pack = Math.max(variant.packSize, 1);
  if (quantity % pack !== 0) {
    quantity = Math.ceil(quantity / pack) * pack;
    warnings.push({
      code: 'QTY_ADJUSTED_PACK_SIZE',
      message: `Quantity rounded up to a multiple of the pack size ${variant.packSize}.`,
      variantId: null,
    });
  }
  if (policy === 'STOCK_ONLY') {
    if (variant.stockQty <= 0) {
      throw new QuantityRuleError(
        'OUT_OF_STOCK',
        `Article ${variant.articleNo ?? ''} is not available.`,
        { stockQty: variant.stockQty },
      );
    }
    if (quantity > variant.stockQty) {
      // Largest pack-multiple that fits the shelf, never below minOrderQty.
      quantity = Math.max(Math.floor(variant.stockQty / pack) * pack, Math.min(variant.minOrderQty, variant.stockQty));
      warnings.push({
        code: 'QTY_ADJUSTED_STOCK',
        message: `Quantity limited to the available stock of ${variant.stockQty}.`,
        variantId: null,
      });
    }
  }
  return { quantity, warnings };
}

/** Priced line feeding the totals (Decimal or decimal string money). */
export interface PricedLine {
  unitPrice: Prisma.Decimal | string;
  quantity: number;
}

/**
 * Cart/order totals: subtotal → tax (rate from settings, 2dp half-up) →
 * shipping (standard: flat rate, free at/above the threshold) → grand total.
 * Express delivery is a checkout concern (rate may be unset) and is priced by
 * the checkout service via `shippingFor`.
 */
export function computeTotals(
  lines: PricedLine[],
  settings: { tax: { ratePercent: number }; shipping: { flatRateInr: number; freeThresholdInr: number; note: string } },
): CartTotalsDto {
  const subtotal = lines.reduce(
    (sum, line) => sum.plus(new Prisma.Decimal(line.unitPrice).mul(line.quantity)),
    new Prisma.Decimal(0),
  );
  const taxRatePercent = settings.tax.ratePercent;
  const taxTotal = subtotal.mul(taxRatePercent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const shippingTotal = shippingFor('standard', subtotal, settings.shipping);
  const grandTotal = subtotal.plus(taxTotal).plus(shippingTotal);
  const freeAt = new Prisma.Decimal(settings.shipping.freeThresholdInr);
  return {
    subtotal: subtotal.toFixed(2),
    taxRatePercent,
    taxTotal: taxTotal.toFixed(2),
    shippingTotal: shippingTotal.toFixed(2),
    grandTotal: grandTotal.toFixed(2),
    currency: 'INR',
    freeShippingThreshold: settings.shipping.freeThresholdInr,
    shippingNote:
      subtotal.gte(freeAt) && freeAt.gt(0)
        ? 'Free standard delivery'
        : settings.shipping.note,
  };
}

/** Shipping charge for a delivery method against a subtotal. */
export function shippingFor(
  method: 'standard' | 'express',
  subtotal: Prisma.Decimal,
  shipping: { flatRateInr: number; freeThresholdInr: number; expressRateInr?: number },
): Prisma.Decimal {
  if (method === 'express') {
    return new Prisma.Decimal(shipping.expressRateInr ?? 0);
  }
  const threshold = new Prisma.Decimal(shipping.freeThresholdInr);
  if (threshold.gt(0) && subtotal.gte(threshold)) return new Prisma.Decimal(0);
  return new Prisma.Decimal(shipping.flatRateInr);
}

/** Read-time stock warnings for a cart's priced lines. */
export function stockWarnings(
  items: Array<{ variantId: string; quantity: number; stockQty: number; articleNo: string }>,
): CartWarningDto[] {
  const out: CartWarningDto[] = [];
  for (const item of items) {
    if (item.stockQty <= 0) {
      out.push({
        code: 'OUT_OF_STOCK',
        message: `Article ${item.articleNo} is currently not in stock — the item will be ordered as a backorder.`,
        variantId: item.variantId,
      });
    } else if (item.quantity > item.stockQty) {
      out.push({
        code: 'LOW_STOCK',
        message: `Only ${item.stockQty} of article ${item.articleNo} in stock — the remaining quantity will be backordered.`,
        variantId: item.variantId,
      });
    }
  }
  return out;
}
