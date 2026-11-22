# product

Category listing composition (spec 6.3): filter bar, active chips, list/tile
views, pagination and the SEO helpers, plus the server-side data access the
category page uses.

**Public surface:** `CategoryListing` (filter bar + results + pagination),
`ListingList`/`ListingTiles`/`ListingCard`, `FilterBar` (+drawer on mobile),
`ActiveFilterChips`, `CategoryTileGrid`, `api.ts` (getCategory, getListing,
getFilterDefs, getBreadcrumb…), `seo.ts` (metadata + ItemList JSON-LD),
`view.ts` (list/tile cookie), `filter-url` parsing.

**Key flows**

- The catch-all category page (`app/[country]/[lang]/[...path]/page.tsx`)
  parses `…/c/{code}` from the URL, loads category + filter defs + listing
  server-side, then hands over to `CategoryListing` for interactive
  filtering.
- Filter/sort state lives in the URL (shareable, bookmarkable); changing a
  filter pushes a new URL and the server re-renders with fresh facet counts.
- View preference persists in the `th:view` cookie (default: list).

**Gotchas**

- Filtered/sorted URLs get `canonical → unfiltered` + `noindex,follow`
  (see `docs/seo.md`).
- Facet counts are disjunctive: a facet never filters itself.
- `parseFilterParams` is the single source of truth for URL → filter state —
  never parse query strings ad hoc in a component.
