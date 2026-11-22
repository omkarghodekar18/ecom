// PDP article-slug parsing (spec 7: `/p/{productSlug}-{firstArticleNo}`).
// The product slug itself contains hyphens and the slugified article number
// ("111100 0,5" → "111100-0-5") adds more, so the boundary cannot be located
// syntactically. Strategy: try progressively shorter prefixes of the incoming
// article slug against GET /products/:slug until one resolves (product slugs
// never end in a pure numeric/comma segment, so the first hit is correct).
import { slugifyArticleNo } from '@/config/routes';
import type { ProductDetailDto, VariantDto } from '@/shared/dto/product.dto';

/** Max trailing segments stripped while probing candidate product slugs. */
export const MAX_SLUG_STRIPS = 6;

/**
 * Ordered product-slug candidates for an article slug: the whole string
 * first, then with 1..MAX_SLUG_STRIPS trailing hyphen segments removed
 * (always keeping at least one segment). The resolver probes these in order
 * against the API and the first hit is the product.
 *
 * @example candidateProductSlugs('centre-drill-hss-e-a-tialn-111100-0-5')[3]
 *   // 'centre-drill-hss-e-a-tialn'
 */
export function candidateProductSlugs(articleSlug: string, maxStrips = MAX_SLUG_STRIPS): string[] {
  const parts = articleSlug.split('-').filter((p) => p.length > 0);
  if (parts.length === 0) return [];
  const candidates: string[] = [];
  const limit = Math.min(maxStrips, parts.length - 1);
  for (let stripped = 0; stripped <= limit; stripped += 1) {
    candidates.push(parts.slice(0, parts.length - stripped).join('-'));
  }
  return candidates;
}

/**
 * The variant part of an article slug: everything after `{productSlug}-`,
 * or null when the article slug IS the product slug (no article tail).
 */
export function extractVariantSlug(articleSlug: string, productSlug: string): string | null {
  if (articleSlug === productSlug) return null;
  if (!articleSlug.startsWith(`${productSlug}-`)) return null;
  return articleSlug.slice(productSlug.length + 1);
}

/** Finds the variant whose article number slugifies to `variantSlug`. */
export function findVariantBySlug(variants: VariantDto[], variantSlug: string): VariantDto | undefined {
  return variants.find((v) => slugifyArticleNo(v.articleNo) === variantSlug);
}

export interface ResolvedArticleSlug {
  product: ProductDetailDto;
  /** Slugified article number tail from the URL (null when absent). */
  variantSlug: string | null;
}

/**
 * Resolves an article slug against the product API by probing the candidate
 * prefixes in order (see `candidateProductSlugs`). 404s advance to the next
 * candidate; when nothing matches, null is returned (page → notFound()).
 */
export async function resolveArticleSlug(
  articleSlug: string,
  getProduct: (slug: string) => Promise<ProductDetailDto | null>,
): Promise<ResolvedArticleSlug | null> {
  for (const slug of candidateProductSlugs(articleSlug)) {
    const product = await getProduct(slug);
    if (product) {
      return { product, variantSlug: extractVariantSlug(articleSlug, product.slug) };
    }
  }
  return null;
}
