// Server-side data access for the search experience (spec 6.5/12). Search
// RESULT pages are deliberately NOT ISR-cached (stock/prices stay fresh and
// result URLs are user-generated, noindex); the global filter set is as static
// as the category filter sets and caches like them.
import { apiFetch } from '@/lib/api-client';
import { toApiQuery, type FilterState } from '@/lib/filter-url';
import type { CategoryAttributeDto } from '@/shared/dto/catalog.dto';
import type { SearchResponseDto, SuggestDto } from '@/shared/dto/search.dto';

export { ApiError } from '@/lib/api-client';

/** One search results page for a parsed filter state (q included). */
export async function getSearchListing(state: FilterState): Promise<{
  listing: SearchResponseDto;
  totalPages: number;
}> {
  const { data, meta } = await apiFetch<SearchResponseDto>('/search', {
    query: toApiQuery(state),
  });
  return { listing: data, totalPages: meta?.totalPages ?? 1 };
}

/** Global filter definitions for the search page's FilterBar. */
export async function getSearchFilterDefs(): Promise<CategoryAttributeDto[]> {
  const { data } = await apiFetch<CategoryAttributeDto[]>('/search/filters', {
    next: { revalidate: 600, tags: ['search-filters'] },
  });
  return data;
}

/**
 * Autocomplete groups for the header search box (client-side; same-origin
 * /api/v1 rewrite). Terms shorter than 2 chars are not sent — the backend
 * rejects them with 400.
 */
export async function getSuggest(q: string): Promise<SuggestDto> {
  const { data } = await apiFetch<SuggestDto>('/search/suggest', { query: { q } });
  return data;
}
