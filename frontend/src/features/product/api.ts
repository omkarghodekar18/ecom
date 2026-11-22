// Server-side data access for the category/listing experience (spec 6.2/6.3).
// Every read is ISR-cached (10 min) and tagged `category:{code}` so the admin
// can revalidate a category on change (spec 13.9). 404s bubble up as ApiError
// — the page maps them to notFound().
import { apiFetch, ApiError } from '@/lib/api-client';
import { toApiQuery, type FilterState } from '@/lib/filter-url';
import type { BrandDto, CategoryAttributeDto, CategoryDto, CrumbDto } from '@/shared/dto/catalog.dto';
import type { ListingResponse } from '@/shared/dto/product.dto';

export { ApiError };

const REVALIDATE_SECONDS = 600;

/** Cache options shared by all catalog reads of one category. */
function categoryCache(code: string) {
  return { revalidate: REVALIDATE_SECONDS, tags: [`category:${code}`] };
}

export async function getCategory(code: string): Promise<CategoryDto> {
  const { data } = await apiFetch<CategoryDto>(`/categories/${code}`, {
    next: categoryCache(code),
  });
  return data;
}

export async function getBreadcrumb(code: string): Promise<CrumbDto[]> {
  const { data } = await apiFetch<CrumbDto[]>(`/categories/${code}/breadcrumb`, {
    next: categoryCache(code),
  });
  return data;
}

export async function getFilterDefs(code: string): Promise<CategoryAttributeDto[]> {
  const { data } = await apiFetch<CategoryAttributeDto[]>(`/categories/${code}/filters`, {
    next: categoryCache(code),
  });
  return data;
}

export async function getBrands(): Promise<BrandDto[]> {
  const { data } = await apiFetch<BrandDto[]>('/brands', {
    next: { revalidate: REVALIDATE_SECONDS, tags: ['brands'] },
  });
  return data;
}

export interface ListingResult {
  listing: ListingResponse;
  totalPages: number;
}

/** Fetches one page of the listing for a parsed filter state. */
export async function getListing(code: string, state: FilterState): Promise<ListingResult> {
  const { data, meta } = await apiFetch<ListingResponse>(`/categories/${code}/products`, {
    query: toApiQuery(state),
    next: categoryCache(code),
  });
  return { listing: data, totalPages: meta?.totalPages ?? 1 };
}

/** Re-usable helper: converts an ApiError into a notFound()/rethrow decision. */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.code === 'NOT_FOUND');
}
