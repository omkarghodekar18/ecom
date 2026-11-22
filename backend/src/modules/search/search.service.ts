// Search service (spec Sections 9/12/6.5): ranked full-text search over the
// trigger-maintained Product searchVector, autocomplete groups, and the global
// filter set. Everything above the repository depends on the SearchEngine
// interface only, so a future MeilisearchEngine can replace
// PostgresSearchEngine without touching a caller.
//
// The listing pipeline intentionally reuses the products module verbatim
// (parseAttributeFilters + the id-list filter replay + computeFacets +
// buildListingDtos): search results keep EXACTLY the category listing's filter
// semantics — AND across attributes, OR inside a value set, one active variant
// satisfies all predicates — and carry the same disjunctive facets.
import { badRequest } from '../../common/errors/app-error.js';
import { mediaUrl } from '../catalog/public-id.util.js';
import type { CategoryAttributeDto } from '../../shared/dto/catalog.dto.js';
import type { ListingResponse } from '../../shared/dto/product.dto.js';
import type { SuggestDto } from '../../shared/dto/search.dto.js';
import {
  buildListingDtos,
  computeFacets,
  filterIndexFromDefs,
  listGlobalFacetAttributes,
  orderByFor,
  parseAttributeFilters,
  productsRepository,
} from '../products/index.js';
import type { ListingQuery, ProductListRow } from '../products/index.js';
import { searchRepository } from './postgres-search.repository.js';
import type { SearchEngine, SearchParams } from './search.types.js';

/**
 * Candidate cap for one text query (Meilisearch-style maxTotalHits): ranking,
 * the filter replay and facet counting all stay bounded regardless of how
 * generic the term is. Higher than any realistic result page ever needs.
 */
export const MAX_SEARCH_CANDIDATES = 500;

/** Autocomplete group sizes (spec 6.5 search box proportions). */
export const SUGGEST_LIMITS = { products: 5, categories: 4, brands: 3 } as const;

/** Search response: the listing page plus the exact-article fast path. */
export type SearchResponse = ListingResponse & { exactArticleNo: string | null };

/**
 * Postgres implementation of the SearchEngine seam: text matching + ranking
 * live in the repository (raw SQL over searchVector + pg_trgm); the engine
 * composes the shared products-module listing pipeline around the ranked ids.
 */
export class PostgresSearchEngine implements SearchEngine {
  async search(params: SearchParams): Promise<SearchResponse> {
    const matches = await searchRepository.matchProductIds(params.q, MAX_SEARCH_CANDIDATES);
    // Best-first ranking: the FIRST exact articleNo/EAN match is the fast-path hit.
    const exactArticleNo = matches.find((m) => m.exactArticleNo !== null)?.exactArticleNo ?? null;
    const rankedIds = matches.map((m) => m.id);

    // Replay the user filters over the ranked set — order-preserving steps,
    // mirroring listProducts() in the products module one by one.
    let ids = rankedIds;
    if (params.brandSlugs.length > 0) {
      const membership = await productsRepository.listBrandMembership(ids);
      const brandByProduct = new Map(membership.map((m) => [m.id, m.brand.slug]));
      const allowed = new Set(params.brandSlugs);
      ids = ids.filter((id) => allowed.has(brandByProduct.get(id) ?? ''));
    }
    if (params.inStock) {
      const inStock = new Set(await productsRepository.listInStockProductIds(ids));
      ids = ids.filter((id) => inStock.has(id));
    }
    if (params.predicates.length > 0) {
      ids = await productsRepository.filterIdsByVariantAttributes(ids, params.predicates);
    }
    const total = ids.length;

    // Facet metadata: the global filterable set (same source as brand listings).
    const facetAttributes = await listGlobalFacetAttributes();
    const [rows, facets] = await Promise.all([
      this.pageRows(ids, params),
      computeFacets({
        scopeIds: rankedIds,
        facetAttributes,
        predicates: params.predicates,
        brandSlugs: params.brandSlugs,
        inStock: params.inStock,
      }),
    ]);
    const items = await buildListingDtos(rows);
    return { items, facets, total, sort: params.sort, exactArticleNo };
  }

  /**
   * Final page rows. `relevance` keeps the search ranking (the repository
   * order is score → ts_rank → trigram similarity → id); every other sort
   * delegates to the products module's orderByFor with a stable id tiebreak.
   */
  private async pageRows(ids: string[], params: SearchParams): Promise<ProductListRow[]> {
    if (params.sort === 'relevance') {
      const pageIds = ids.slice(params.skip, params.skip + params.take);
      if (pageIds.length === 0) return [];
      // Fetch unordered, then restore the ranking order in memory.
      const rows = await productsRepository.findPageByIds(pageIds, [{ id: 'asc' }], 0, pageIds.length);
      const rowById = new Map(rows.map((r) => [r.id, r]));
      return pageIds.flatMap((id) => {
        const row = rowById.get(id);
        return row ? [row] : [];
      });
    }
    return productsRepository.findPageByIds(ids, orderByFor(params.sort), params.skip, params.take);
  }

  async suggest(q: string): Promise<SuggestDto> {
    const [products, categories, brands] = await Promise.all([
      searchRepository.suggestProducts(q, SUGGEST_LIMITS.products),
      searchRepository.suggestCategories(q, SUGGEST_LIMITS.categories),
      searchRepository.suggestBrands(q, SUGGEST_LIMITS.brands),
    ]);
    return {
      products: products.map((p) => ({
        slug: p.slug,
        name: p.name,
        articleNo: p.articleNo,
        image: mediaUrl(p.imagePublicId),
        brandName: p.brandName,
      })),
      categories: categories.map((c) => ({ name: c.name, pathSlugs: c.pathSlugs, code: c.code })),
      brands: brands.map((b) => ({ slug: b.slug, name: b.name })),
    };
  }
}

/** Engine singleton — swap this binding for a MeilisearchEngine later. */
export const searchEngine: SearchEngine = new PostgresSearchEngine();

export const searchService = {
  /**
   * Full search listing for one parsed ListingQuery + q. Raw attribute filter
   * params are validated here against the GLOBAL filter index (every attribute
   * mapped to ≥1 category) — identical 400 behaviour to the category listing.
   */
  async search(q: string, query: ListingQuery): Promise<SearchResponse> {
    if (q.trim().length < 2) {
      throw badRequest("Query parameter 'q' is required (2–100 characters after trimming)", { q });
    }
    const index = filterIndexFromDefs(await productsRepository.listMappedAttributeDefs());
    const predicates = parseAttributeFilters(query.attributeFilters, index);
    return searchEngine.search({
      q,
      page: query.page,
      pageSize: query.pageSize,
      skip: query.skip,
      take: query.take,
      sort: query.sort,
      inStock: query.inStock,
      brandSlugs: query.brandSlugs,
      predicates,
    });
  },

  /** Autocomplete groups for the header search box (spec 6.5). */
  async suggest(q: string): Promise<SuggestDto> {
    if (q.trim().length < 2) {
      throw badRequest("Query parameter 'q' is required (2–100 characters after trimming)", { q });
    }
    return searchEngine.suggest(q.trim());
  },

  /**
   * Global filter set for the search page's FilterBar: every attribute that is
   * filterable in ANY category (deduped, lowest sortOrder wins), shaped as
   * CategoryAttributeDto rows. Mapping-level flags that do not exist globally
   * carry their fixed values (isRequired=false, isFilterable=true,
   * isVariantAxis=false; sortOrder is the display order).
   */
  async filterDefs(): Promise<CategoryAttributeDto[]> {
    const metas = await listGlobalFacetAttributes();
    return metas.map((m, i) => ({
      id: m.id,
      key: m.key,
      label: m.label,
      labelHtml: m.labelHtml,
      groupName: m.groupName,
      type: m.type,
      unit: m.unit,
      enumValues: m.enumValues,
      isRequired: false,
      isFilterable: true,
      isVariantAxis: false,
      filterWidget: m.widget,
      sortOrder: i,
    }));
  },
};
