// Unit tests for the pure cart rules (spec Section 11) and article-number
// candidate expansion.
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { applyQuantityRules, computeTotals, shippingFor, stockWarnings } from '../../src/modules/cart/cart.rules.js';
import { articleNoCandidates } from '../../src/common/utils/article-no.util.js';

const variant = (over: Partial<Parameters<typeof applyQuantityRules>[1]> = {}) => ({
  minOrderQty: 1,
  packSize: 1,
  stockQty: 50,
  articleNo: '111100 0,5',
  ...over,
});

describe('applyQuantityRules', () => {
  it('passes plain quantities through unchanged', () => {
    const result = applyQuantityRules(3, variant(), 'ALLOW_BACKORDER');
    expect(result.quantity).toBe(3);
    expect(result.warnings).toEqual([]);
  });

  it('raises quantity to the minimum order quantity', () => {
    const result = applyQuantityRules(2, variant({ minOrderQty: 10 }), 'ALLOW_BACKORDER');
    expect(result.quantity).toBe(10);
    expect(result.warnings.map((w) => w.code)).toEqual(['QTY_ADJUSTED_MIN_ORDER']);
  });

  it('rounds up to a pack-size multiple', () => {
    const result = applyQuantityRules(7, variant({ packSize: 5 }), 'ALLOW_BACKORDER');
    expect(result.quantity).toBe(10);
    expect(result.warnings.map((w) => w.code)).toEqual(['QTY_ADJUSTED_PACK_SIZE']);
  });

  it('applies both rules in sequence (min then pack)', () => {
    const result = applyQuantityRules(1, variant({ minOrderQty: 6, packSize: 5 }), 'ALLOW_BACKORDER');
    expect(result.quantity).toBe(10);
    expect(result.warnings.map((w) => w.code)).toEqual(['QTY_ADJUSTED_MIN_ORDER', 'QTY_ADJUSTED_PACK_SIZE']);
  });

  it('allows exceeding stock under ALLOW_BACKORDER (no clamp)', () => {
    const result = applyQuantityRules(80, variant({ stockQty: 50 }), 'ALLOW_BACKORDER');
    expect(result.quantity).toBe(80);
    expect(result.warnings).toEqual([]);
  });

  it('rejects zero stock under STOCK_ONLY', () => {
    expect(() => applyQuantityRules(5, variant({ stockQty: 0 }), 'STOCK_ONLY')).toThrowError(/not available/);
  });

  it('clamps to the largest pack multiple on the shelf under STOCK_ONLY', () => {
    const result = applyQuantityRules(48, variant({ packSize: 5, stockQty: 32 }), 'STOCK_ONLY');
    expect(result.quantity).toBe(30);
    expect(result.warnings.map((w) => w.code)).toEqual(['QTY_ADJUSTED_PACK_SIZE', 'QTY_ADJUSTED_STOCK']);
  });

  it('never clamps below minOrderQty while stock allows it', () => {
    const result = applyQuantityRules(99, variant({ minOrderQty: 4, packSize: 5, stockQty: 7 }), 'STOCK_ONLY');
    // floor(7/5)*5 = 5 ≥ minOrderQty 4 → 5
    expect(result.quantity).toBe(5);
  });
});

describe('computeTotals', () => {
  const settings = {
    tax: { ratePercent: 18 },
    shipping: { flatRateInr: 250, freeThresholdInr: 10_000, note: 'Calculated at checkout' },
  };

  it('computes subtotal, tax (2dp half-up), flat shipping and grand total', () => {
    const totals = computeTotals(
      [
        { unitPrice: '80.00', quantity: 10 },
        { unitPrice: '50.125', quantity: 2 },
      ],
      settings,
    );
    // subtotal 800 + 100.25 = 900.25; tax 162.045 → 162.05 (half-up)
    expect(totals.subtotal).toBe('900.25');
    expect(totals.taxTotal).toBe('162.05');
    expect(totals.shippingTotal).toBe('250.00');
    expect(totals.grandTotal).toBe('1312.30');
  });

  it('standard shipping is free at/above the threshold', () => {
    const totals = computeTotals([{ unitPrice: '600.00', quantity: 20 }], settings);
    expect(totals.shippingTotal).toBe('0.00');
    expect(totals.shippingNote).toMatch(/free/i);
  });
});

describe('shippingFor', () => {
  const shipping = { flatRateInr: 250, freeThresholdInr: 10_000, expressRateInr: 490 };

  it('flat rate below the threshold, free at it', () => {
    expect(shippingFor('standard', new Prisma.Decimal('9999.99'), shipping).toFixed(2)).toBe('250.00');
    expect(shippingFor('standard', new Prisma.Decimal('10000.00'), shipping).toFixed(2)).toBe('0.00');
  });

  it('express is a flat rate independent of the threshold', () => {
    expect(shippingFor('express', new Prisma.Decimal('20000.00'), shipping).toFixed(2)).toBe('490.00');
  });

  it('express without a configured rate is 0 (validate blocks the method earlier)', () => {
    const noExpress = { flatRateInr: 250, freeThresholdInr: 10_000 };
    expect(shippingFor('express', new Prisma.Decimal('100.00'), noExpress).toFixed(2)).toBe('0.00');
  });
});

describe('stockWarnings', () => {
  it('flags out-of-stock and low-stock lines', () => {
    const warnings = stockWarnings([
      { variantId: 'v1', quantity: 5, stockQty: 0, articleNo: 'A' },
      { variantId: 'v2', quantity: 10, stockQty: 4, articleNo: 'B' },
      { variantId: 'v3', quantity: 2, stockQty: 9, articleNo: 'C' },
    ]);
    expect(warnings.map((w) => w.code)).toEqual(['OUT_OF_STOCK', 'LOW_STOCK']);
    expect(warnings[0]?.variantId).toBe('v1');
  });
});

describe('articleNoCandidates', () => {
  it('expands comma/dot decimal styles and collapses whitespace', () => {
    expect(articleNoCandidates('111100 0,5')).toEqual(['111100 0,5', '111100 0.5']);
    expect(articleNoCandidates('111100 0.5')).toEqual(['111100 0.5', '111100 0,5']);
    expect(articleNoCandidates('  111100   0,5 ')).toEqual(['111100   0,5', '111100 0,5', '111100 0.5']);
  });

  it('returns the plain string unchanged when no decimals are involved', () => {
    expect(articleNoCandidates('222300')).toEqual(['222300']);
  });
});
