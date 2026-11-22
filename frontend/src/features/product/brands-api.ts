// Server-side brand fetchers: GET /brands (list with product counts),
// GET /brands/:slug and GET /brands/:slug/products (listing). ISR-cached
// (10 min) under the `brands` / `brand:{slug}` tags.
import { z } from 'zod';
import { ApiError, apiFetch, type PageMeta } from '@/lib/api-client';
import { BrandDtoSchema } from '@/shared/dto/catalog.dto';
import { ListingResponseSchema } from '@/shared/dto/product.dto';
import type { BrandDto } from '@/shared/dto/catalog.dto';
import type { ListingResponse } from '@/shared/dto/product.dto';

const REVALIDATE_SECONDS = 600;

/** GET /brands row — the documented superset `BrandDto & { productCount }`. */
export const BrandWithCountSchema = BrandDtoSchema.extend({ productCount: z.number().int() });
export type BrandWithCount = z.infer<typeof BrandWithCountSchema>;

/** All brands (name-sorted by the API) with live product counts. */
export async function fetchBrands(): Promise<BrandWithCount[]> {
  const res = await apiFetch<unknown>('/brands', {
    next: { revalidate: REVALIDATE_SECONDS, tags: ['brands'] },
  });
  return z.array(BrandWithCountSchema).parse(res.data);
}

/** One brand; null (→ notFound()) when the API answers 404. */
export async function fetchBrand(slug: string): Promise<BrandDto | null> {
  try {
    const res = await apiFetch<unknown>(`/brands/${encodeURIComponent(slug)}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: [`brand:${slug}`, 'brands'] },
    });
    return BrandDtoSchema.parse(res.data);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export interface BrandProductsQuery {
  page?: number;
  pageSize?: number;
  /** Whitelisted by the caller (SortSchema) before it reaches here. */
  sort?: string;
}

/** Brand product listing (tile-card data) plus the pagination envelope. */
export async function fetchBrandProducts(
  slug: string,
  query: BrandProductsQuery = {},
): Promise<{ listing: ListingResponse; meta?: PageMeta }> {
  const res = await apiFetch<unknown>(`/brands/${encodeURIComponent(slug)}/products`, {
    query: { page: query.page, pageSize: query.pageSize, sort: query.sort },
    next: { revalidate: REVALIDATE_SECONDS, tags: [`brand:${slug}`, 'brands'] },
  });
  return { listing: ListingResponseSchema.parse(res.data), meta: res.meta };
}
