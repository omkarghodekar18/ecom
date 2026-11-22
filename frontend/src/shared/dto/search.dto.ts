// Search contract (spec Sections 9/12/6.5). Mirrored to frontend — only zod
// + relative imports.
//
// The search LISTING reuses the products module's ListingResponse (same shape
// as the category listing, facets included); this file adds the search-only
// pieces: the autocomplete payload and the query contract.
import { z } from 'zod';
import { CategoryAttributeDtoSchema } from './catalog.dto';
import { ListingResponseSchema, SortSchema } from './product.dto';

/** Free-text q for /search and /search/suggest: trimmed, 2–100 chars. */
export const SearchQSchema = z.string().trim().min(2).max(100);
export type SearchQ = z.infer<typeof SearchQSchema>;

// ── autocomplete (GET /search/suggest) ───────────────────────────────────────

export const SuggestedProductDtoSchema = z.object({
  slug: z.string(),
  name: z.string(),
  /** First variant's article no (the exact matched one for exact hits). */
  articleNo: z.string().nullable(),
  /** Resolved media URL of the first product image. */
  image: z.string().nullable(),
  brandName: z.string(),
});
export type SuggestedProductDto = z.infer<typeof SuggestedProductDtoSchema>;

export const SuggestedCategoryDtoSchema = z.object({
  name: z.string(),
  pathSlugs: z.string(),
  code: z.string(),
});
export type SuggestedCategoryDto = z.infer<typeof SuggestedCategoryDtoSchema>;

export const SuggestedBrandDtoSchema = z.object({
  slug: z.string(),
  name: z.string(),
});
export type SuggestedBrandDto = z.infer<typeof SuggestedBrandDtoSchema>;

export const SuggestDtoSchema = z.object({
  products: z.array(SuggestedProductDtoSchema),
  categories: z.array(SuggestedCategoryDtoSchema),
  brands: z.array(SuggestedBrandDtoSchema),
});
export type SuggestDto = z.infer<typeof SuggestDtoSchema>;

// ── search listing (GET /search) ─────────────────────────────────────────────

/**
 * Documented query contract. Beyond these keys, EVERY other query parameter is
 * an attribute filter exactly like the category listing (`key=v1,v2`,
 * `key=true|false`, `key_min`/`key_max`) — validated against the mapped
 * attribute definitions by the shared listing pipeline. The runtime parsing
 * reuses the products controller's `parseListingQuery`; this schema documents
 * the contract (and feeds the OpenAPI registration).
 */
export const SearchQueryDtoSchema = z.object({
  q: SearchQSchema,
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  sort: SortSchema.default('relevance'),
  inStock: z.enum(['true', 'false']).default('false'),
  brand: z.string().trim().max(1000).optional(),
});
export type SearchQueryDto = z.infer<typeof SearchQueryDtoSchema>;

/** GET /search response: the listing page plus the exact-article fast path. */
export const SearchResponseDtoSchema = ListingResponseSchema.extend({
  /** Article no with an EXACT public match for q (spec 6.5: the frontend can
   *  jump straight to the PDP); null when q is not an exact article number /
   *  EAN. `optional` keeps the field lenient for older clients. */
  exactArticleNo: z.string().nullable().optional(),
});
export type SearchResponseDto = z.infer<typeof SearchResponseDtoSchema>;

/**
 * GET /search/filters response: the GLOBAL filter set (every attribute that is
 * filterable in ANY category, deduped) shaped as CategoryAttributeDto rows so
 * the search page can feed the same FilterBar as the category pages. The
 * mapping-level flags carry their fixed global values (isRequired=false,
 * isFilterable=true, isVariantAxis=false; sortOrder is the display order).
 */
export const SearchFiltersDtoSchema = z.array(CategoryAttributeDtoSchema);
export type SearchFiltersDto = z.infer<typeof SearchFiltersDtoSchema>;
