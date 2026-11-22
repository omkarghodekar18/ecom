# search

Search results page (spec Section 12): the `/search` route's listing plus the
typed API client. FTS + trigram matching, exact article/EAN hit banner,
faceted filtering with URL-driven state.

**Public surface:** `SearchListing` (results composition, mounted by
`app/[country]/[lang]/(shop)/search/page.tsx`), `searchApi` (list + suggest).

**Key flows**

- Query → `GET /search?q=…` with the same filter/sort/pagination URL contract
  as category listings (`?brand=…&dc_min=…&sort=price_asc&page=…`).
- When the query matches an article number/EAN exactly, a banner offers the
  direct PDP jump (row is located by `firstArticleNo`).
- Filters come from `CategoryAttribute` definitions (same filter bar
  components as category listings via `features/product`).

**Gotchas**

- The page is `noindex` (search results must not be indexed).
- Suggest/autocomplete is used by the header combobox
  (`components/layout/header-search.tsx`), not by this view.
- Empty results render the `EmptyState` with a "clear filters" hint — keep
  that behaviour when touching the filter parser.
