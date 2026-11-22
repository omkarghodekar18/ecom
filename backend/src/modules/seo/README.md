# seo module

Sitemap chunk feed for the storefront (spec Section 13 SEO): one 1-based page
stream per entity type with at most 45,000 URLs per chunk (protocol budget 50k,
headroom kept). Read-only — no repository/controller split, prisma lives in the
service (health-module precedent).

**Public API** (`index.ts`): `seoRouter` (mount at the API root), `seoService`,
`SITEMAP_PAGE_SIZE`, `slugifyArticleNo`.

**Mounting:** the router owns its whole sub-path space, so mount it at the API
prefix itself — `app.use(API_PREFIX, seoRouter)`.

## Endpoints (all under `/api/v1`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/seo/sitemap/index` | public | `{types: [{type, totalPages}]}` for all four streams |
| GET | `/seo/sitemap/:type/:page` | public | one chunk of `categories` \| `products` \| `brands` \| `cms`; 400 on bad type/page, 404 beyond the last chunk |

## Key flows

- **Loc paths** are locale-prefixed storefront paths (`/in/en/…`, no origin) and are
  built to stay byte-identical with the frontend URL builders
  (`frontend/src/config/routes.ts`): category `/{pathSlugs}/c/{code}`, product
  `/p/{slug}-{slugifiedFirstArticleNo}`, brand `/brands/{slug}`, CMS page `/e/{slug}`.
  `slugifyArticleNo` mirrors the frontend helper exactly ("111100 0,5" → "111100-0-5").
- **First variant per product** — the product URL seed is the first visible variant
  by (sortOrder, articleNo), fetched with ONE `DISTINCT ON` raw query restricted to
  the chunk's product ids (`Prisma.join`), never the whole Variant table; chunking
  (`orderBy id` + skip/take) keeps pagination correct at scale.
- **Visibility** mirrors the public reads: categories reuse `ACTIVE_CATEGORY`,
  products `PUBLISHED_PRODUCT`, CMS pages `status: 'PUBLISHED'` (drafts never listed).
- **Lastmod** from `updatedAt` where the model has it (Category/Product/CmsPage);
  Brand has no timestamps in the schema → `updatedAt: null`.

## Gotchas

- `totalPages` is at least 1 per stream (chunk 1 of an empty stream is a valid,
  empty list) — build sitemap XML files from the index and skip empty ones if the
  search engine console complains.
- Out-of-range chunks 404 instead of returning empty lists — stale index data
  (e.g. after catalog shrinkage) surfaces loudly instead of silently.
- Products with zero visible variants fall back to the bare `/p/{slug}` path.
