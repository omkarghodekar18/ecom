// Search module types — the engine seam of spec Section 12: everything above
// the repository (service, controller, routes) depends on the SearchEngine
// interface only, so a future MeilisearchEngine can replace the
// PostgresSearchEngine without touching a single caller.
import type { ListingResponse, Sort } from '../../shared/dto/product.dto.js';
import type { SuggestDto } from '../../shared/dto/search.dto.js';
import type { AttributePredicate } from '../products/index.js';

/**
 * Parameters of a search listing: the products listing's filter shape
 * (see ListingQuery) plus the free-text `q`. Attribute filters arrive as
 * PARSED predicates — the service validates raw query params against the
 * same index the listings use before they get here.
 */
export interface SearchParams {
  /** Free-text query (whitespace-normalised by the service before this). */
  q: string;
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  sort: Sort;
  inStock: boolean;
  brandSlugs: string[];
  /**
   * Attribute predicates with the listing's exact semantics: AND across
   * attributes, OR inside one attribute's value set, and a product matches
   * when ONE active variant satisfies all predicates.
   */
  predicates: AttributePredicate[];
}

/**
 * Full-text search engine contract (spec 12). `search` returns the standard
 * listing response (items + DISJUNCTIVE facets + total + sort) plus the
 * exact-article fast path; `suggest` returns the autocomplete groups.
 */
export interface SearchEngine {
  search(params: SearchParams): Promise<ListingResponse & { exactArticleNo: string | null }>;
  suggest(q: string): Promise<SuggestDto>;
}
