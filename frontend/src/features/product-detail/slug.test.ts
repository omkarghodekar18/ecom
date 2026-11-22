import { describe, expect, it } from 'vitest';
import type { VariantDto } from '@/shared/dto/product.dto';
import {
  candidateProductSlugs,
  extractVariantSlug,
  findVariantBySlug,
  resolveArticleSlug,
} from './slug';

function variant(articleNo: string): VariantDto {
  return {
    id: `id-${articleNo}`,
    articleNo,
    ean: null,
    name: null,
    listPrice: '1.00',
    currency: 'INR',
    priceUnit: 1,
    unitLabel: 'Piece',
    taxClass: 'STANDARD',
    stockQty: 1,
    leadTimeMinDays: null,
    leadTimeMaxDays: null,
    minOrderQty: 1,
    packSize: 1,
    isActive: true,
    priceTiers: [],
    attributes: {},
    availability: { tone: 'green', label: 'In stock', stockQty: 1, leadTimeMinDays: null, leadTimeMaxDays: null },
  };
}

describe('candidateProductSlugs', () => {
  it('probes the whole slug first, then strips up to 6 trailing segments (flagship example)', () => {
    expect(candidateProductSlugs('centre-drill-hss-e-a-tialn-111100-0-5')).toEqual([
      'centre-drill-hss-e-a-tialn-111100-0-5',
      'centre-drill-hss-e-a-tialn-111100-0',
      'centre-drill-hss-e-a-tialn-111100',
      'centre-drill-hss-e-a-tialn', // ← the real product slug
      'centre-drill-hss-e-a',
      'centre-drill-hss-e',
      'centre-drill-hss', // 6 strips max — never fewer than 1 segment
    ]);
  });

  it('keeps at least one segment for short slugs', () => {
    expect(candidateProductSlugs('w-42')).toEqual(['w-42', 'w']);
    expect(candidateProductSlugs('widget')).toEqual(['widget']);
  });

  it('handles a single-variant product with a hyphenated article number', () => {
    const candidates = candidateProductSlugs('abrasive-sheet-230-280-mm-201110-01');
    expect(candidates[0]).toBe('abrasive-sheet-230-280-mm-201110-01');
    expect(candidates).toContain('abrasive-sheet-230-280-mm');
    expect(candidates.indexOf('abrasive-sheet-230-280-mm')).toBe(2);
  });

  it('ignores empty segments and collapses consecutive hyphens', () => {
    expect(candidateProductSlugs('a--b-1')).toEqual(['a-b-1', 'a-b', 'a']);
  });
});

describe('extractVariantSlug', () => {
  it('returns the tail after the product slug', () => {
    expect(extractVariantSlug('centre-drill-hss-e-a-tialn-111100-0-5', 'centre-drill-hss-e-a-tialn')).toBe(
      '111100-0-5',
    );
  });

  it('returns null when the article slug has no article tail', () => {
    expect(extractVariantSlug('centre-drill-hss-e-a-tialn', 'centre-drill-hss-e-a-tialn')).toBeNull();
  });

  it('returns null when the product slug is not a prefix', () => {
    expect(extractVariantSlug('other-product-1', 'centre-drill-hss-e-a-tialn')).toBeNull();
  });
});

describe('findVariantBySlug', () => {
  it('matches the slugified article number ("111100 0,5" → "111100-0-5")', () => {
    const variants = [variant('111100 0,5'), variant('111100 1,6')];
    expect(findVariantBySlug(variants, '111100-0-5')?.articleNo).toBe('111100 0,5');
    expect(findVariantBySlug(variants, '111100-1-6')?.articleNo).toBe('111100 1,6');
    expect(findVariantBySlug(variants, 'missing')).toBeUndefined();
  });
});

describe('resolveArticleSlug', () => {
  it('probes candidates in order and returns the first hit with its variant tail', async () => {
    const probed: string[] = [];
    const getProduct = async (slug: string) => {
      probed.push(slug);
      return slug === 'centre-drill-hss-e-a-tialn' ? ({ slug, variants: [] } as never) : null;
    };
    const result = await resolveArticleSlug('centre-drill-hss-e-a-tialn-111100-0-5', getProduct);
    expect(probed).toEqual([
      'centre-drill-hss-e-a-tialn-111100-0-5',
      'centre-drill-hss-e-a-tialn-111100-0',
      'centre-drill-hss-e-a-tialn-111100',
      'centre-drill-hss-e-a-tialn',
    ]);
    expect(result?.product.slug).toBe('centre-drill-hss-e-a-tialn');
    expect(result?.variantSlug).toBe('111100-0-5');
  });

  it('returns null when no candidate resolves (page → notFound)', async () => {
    const result = await resolveArticleSlug('does-not-exist-1', async () => null);
    expect(result).toBeNull();
  });

  it('treats a bare product slug as the default variant (no tail)', async () => {
    const result = await resolveArticleSlug('plain-slug', async (slug) => ({ slug, variants: [] } as never));
    expect(result?.variantSlug).toBeNull();
  });
});
