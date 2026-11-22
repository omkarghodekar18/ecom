# search module

Ranked full-text search, autocomplete and the global filter set. Spec Sections
9, 12 and 6.5.

**Public API** (`index.ts`): `searchRouter` (mount at the API root), `searchService`,
`searchEngine` + `SearchEngine` (the engine seam), `searchRepository`.

**Mounting:** the router owns its whole sub-path space, so mount it at the API
prefix itself — `app.use(API_PREFIX, searchRouter)`.

## Endpoints (all under `/api/v1`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/search` | public | ranked listing (same shape + filter semantics as the category listing, disjunctive facets included) plus `exactArticleNo`; q trimmed, 2–100 chars |
| GET | `/search/suggest` | public | autocomplete groups: 5 products / 4 categories / 3 brands |
| GET | `/search/filters` | public | global filter set as `CategoryAttributeDto[]` for the search page's FilterBar |

## Key flows

- **Ranking** (repository, raw SQL): additive tiers over the trigger-maintained
  weighted `searchVector` (migration `20261121040001`) — +3 articleNo prefix /
  exact EAN, +2 FTS (`websearch_to_tsquery` over `unaccent(q)`), +1 pg_trgm
  name similarity; ties break on ts_rank → similarity → id.
- **Listing reuse** — the engine replays the products module's pipeline over
  the ranked ids (`parseAttributeFilters` → brand/inStock/predicate id-list
  steps → `computeFacets` → `buildListingDtos`), so search results keep the
  category listing's exact filter semantics and disjunctive facets.
- **Relevance ordering** — the repository's best-first order is preserved
  through every filter step (all id-list operations keep input order) and
  restored in memory after the page fetch; other sorts delegate to
  `orderByFor`.
- **Engine seam** — everything above the repository depends on `SearchEngine`
  only (see `search.types.ts`); swapping in a MeilisearchEngine later touches
  one binding (`searchEngine` in `search.service.ts`).

## Gotchas

- `q` is a KNOWN_LISTING_KEY in the products controller, so `parseListingQuery`
  never mistakes it for an attribute filter; the search controller validates it
  separately with `SearchQSchema`.
- Candidate scope is capped at `MAX_SEARCH_CANDIDATES` (500) — facet counts are
  computed over the matched set, not the whole catalog.
- Facet metadata comes from `listGlobalFacetAttributes()` (every filterable
  attribute in ANY category) — the same source brand listings use.
- Suggest product images resolve via the catalog `public-id.util.ts`
  (`/media/{publicId}` local adapter), like every other DTO mapper.
- No dedicated rate limit: suggest rides the general API limiter (300/min);
  a keystroke-debounced client stays far below it.
