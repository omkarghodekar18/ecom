// Layer 5 — business rules (spec 16.3): lead-time ordering, min_order_qty
// multiples of pack_size, tier quantity/price ordering, customer price vs
// list price, date ranges, image count limits and publish requirements.
import { issue, type ImportIssueDraft } from '../imports.errors.js';
import type { NormalizedWorkbook } from '../schemas/sheet.schemas.js';

export const MAX_IMAGES_PER_PRODUCT = 12;

export function validateBusiness(normalized: NormalizedWorkbook): ImportIssueDraft[] {
  const issues: ImportIssueDraft[] = [];

  // ── per-variant rules ────────────────────────────────────────────────────
  for (const variant of normalized.variants) {
    if (variant.leadTimeMinDays !== null && variant.leadTimeMaxDays !== null && variant.leadTimeMinDays > variant.leadTimeMaxDays) {
      issues.push(issue.error('Variants', variant.rowNumber, 'LEAD_TIME_ORDER', undefined, 'lead_time_min_days', `${variant.leadTimeMinDays} > ${variant.leadTimeMaxDays}`));
    }
    if (variant.packSize > 0 && variant.minOrderQty % variant.packSize !== 0) {
      issues.push(issue.error('Variants', variant.rowNumber, 'MIN_QTY_PACK', `min_order_qty ${variant.minOrderQty} is not a multiple of pack_size ${variant.packSize}.`, 'min_order_qty'));
    }
  }

  // ── price tiers per article ─────────────────────────────────────────────
  const tiersByArticle = new Map<string, NormalizedWorkbook['priceTiers']>();
  for (const tier of normalized.priceTiers) {
    tiersByArticle.set(tier.articleNo, [...(tiersByArticle.get(tier.articleNo) ?? []), tier]);
  }
  for (const [articleNo, tiers] of tiersByArticle) {
    const sorted = [...tiers].sort((a, b) => a.rowNumber - b.rowNumber);
    let previousQty = -1;
    let previousPrice: number | null = null;
    for (const tier of sorted) {
      if (tier.minQty <= previousQty) {
        issues.push(issue.error('PriceTiers', tier.rowNumber, 'TIER_QUANTITY_ORDER', `Quantities for '${articleNo}' must strictly increase.`, 'min_qty'));
      }
      previousQty = tier.minQty;
      const price = Number(tier.price);
      if (previousPrice !== null && price > previousPrice) {
        issues.push(issue.error('PriceTiers', tier.rowNumber, 'TIER_PRICE_ORDER', `Price for '${articleNo}' must not increase with quantity.`, 'price'));
      }
      previousPrice = price;
    }
  }

  // ── customer prices vs list price + validity range ──────────────────────
  const listPriceByArticle = new Map(normalized.variants.map((variant) => [variant.articleNo, Number(variant.listPrice)]));
  for (const customerPrice of normalized.customerPrices) {
    const listPrice = listPriceByArticle.get(customerPrice.articleNo);
    if (listPrice !== undefined && Number(customerPrice.price) > listPrice) {
      issues.push(issue.warning('CustomerPrices', customerPrice.rowNumber, 'CUSTOMER_PRICE_ABOVE_LIST', undefined, 'price'));
    }
    if (customerPrice.validFrom !== null && customerPrice.validTo !== null && customerPrice.validFrom > customerPrice.validTo) {
      issues.push(issue.error('CustomerPrices', customerPrice.rowNumber, 'DATE_RANGE', undefined, 'valid_from'));
    }
  }

  // ── per-product: image limits + publish requirements ─────────────────────
  const imageCountByKey = new Map<string, number>();
  for (const image of normalized.images) {
    const key = image.productKey ?? normalized.variants.find((variant) => variant.articleNo === image.articleNo)?.productKey;
    if (key !== undefined) imageCountByKey.set(key, (imageCountByKey.get(key) ?? 0) + 1);
  }
  for (const product of normalized.products) {
    const count = imageCountByKey.get(product.productKey) ?? 0;
    if (count > MAX_IMAGES_PER_PRODUCT) {
      issues.push(issue.error('Products', product.rowNumber, 'IMAGE_COUNT_LIMIT', `${count} images exceed the limit of ${MAX_IMAGES_PER_PRODUCT}.`));
    }
    const variantCount = normalized.variants.filter((variant) => variant.productKey === product.productKey).length;
    if (product.status === 'PUBLISHED' && variantCount === 0) {
      issues.push(issue.error('Products', product.rowNumber, 'PUBLISHED_NO_VARIANT'));
    }
    if (product.status === 'PUBLISHED' && count === 0) {
      issues.push(issue.warning('Products', product.rowNumber, 'PUBLISHED_NO_IMAGE'));
    }
  }
  return issues;
}
