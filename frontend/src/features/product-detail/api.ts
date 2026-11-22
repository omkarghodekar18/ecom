// Server-side data access for the PDP (spec 6.4). Reads are ISR-cached for
// 1h and tagged `product:{slug}` so the admin can revalidate a product on
// change (spec 13.9). 404s map to null (the page decides notFound()).
import { apiFetch, ApiError } from '@/lib/api-client';
import type { ListingProductDto, ProductDetailDto } from '@/shared/dto/product.dto';
import { resolveArticleSlug, type ResolvedArticleSlug } from './slug';

const REVALIDATE_SECONDS = 3600;

function productCache(slug: string) {
  return { revalidate: REVALIDATE_SECONDS, tags: [`product:${slug}`] };
}

/** Product detail by slug; null on 404 (missing/invisible). */
export async function getProductDetail(slug: string): Promise<ProductDetailDto | null> {
  try {
    const { data } = await apiFetch<ProductDetailDto>(`/products/${slug}`, {
      next: productCache(slug),
    });
    return data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.code === 'NOT_FOUND')) return null;
    throw error;
  }
}

/** Related/accessory products for a PDP; empty list on 404. */
export async function getRelatedProducts(slug: string): Promise<ListingProductDto[]> {
  try {
    const { data } = await apiFetch<ListingProductDto[]>(`/products/${slug}/related`, {
      next: productCache(slug),
    });
    return data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.code === 'NOT_FOUND')) return [];
    throw error;
  }
}

/**
 * Resolves an incoming `/p/{articleSlug}` param to its product + optional
 * variant tail (progressive candidate probing — see ./slug).
 */
export async function resolveProductByArticleSlug(articleSlug: string): Promise<ResolvedArticleSlug | null> {
  return resolveArticleSlug(articleSlug, getProductDetail);
}
