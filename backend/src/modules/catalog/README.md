# catalog module

Public category reads (navigation, detail, children, filters, breadcrumb) and
admin category tree management. Spec Sections 11 (admin) and 15.1–15.3.

**Public API** (`index.ts`): `catalogRouter` (mount at the API root), `catalogService`,
`refreshCategoryProductCounts`, `catalogRepository`, `subtreeWhere`, `iconUrl`/`mediaUrl`,
`CATALOG_COUNTS_QUEUE`, `scheduleCountRefresh`, `afterCatalogWrite`.

**Mounting:** the router owns its whole sub-path space (public + `/admin/…`), so mount it
at the API prefix itself — `app.use(API_PREFIX, catalogRouter)`.

## Endpoints (all under `/api/v1`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/navigation/tree` | public | `?depth=` default 2, max 5; active only, ordered by sortOrder, cached 5 min (`navigation:tree:{depth}`) |
| GET | `/categories/:code` | public | `CategoryDto` + `path` + `children` (immediate active children) |
| GET | `/categories/:code/children` | public | immediate active children |
| GET | `/categories/:code/filters` | public | effective `CategoryAttributeDto[]` (own mapping, else nearest ancestor's — spec 15.3) |
| GET | `/categories/:code/breadcrumb` | public | `CrumbDto[]`, root first |
| POST | `/admin/categories` | STAFF+ADMIN | 201; path/pathSlugs/level computed from parent in one tx; slug auto from name w/ unique suffix |
| PATCH | `/admin/categories/reorder` | STAFF+ADMIN | body `[{id, parentId?, sortOrder}]` applied in one tx; 204 |
| PATCH | `/admin/categories/move` | STAFF+ADMIN | re-parents + recomputes whole subtree; 400 under own descendant |
| PATCH | `/admin/categories/:id` | STAFF+ADMIN | partial; slug change rewrites subtree pathSlugs + writes SlugRedirects |
| DELETE | `/admin/categories/:id` | STAFF+ADMIN | soft delete; 409 while products/children exist |

## Key flows

- **Path invariants** — `path` is materialised ids (`"/rootId/childId/"`, trailing slash per
  level), `pathSlugs` slug path (`"machining/drilling"`), `level` 1-based. `subtreeWhere`
  turns a category into a `path LIKE '/idA/%'`-equivalent Prisma where (self included).
- **Counts job** — `refreshCategoryProductCounts()` recomputes every active category's
  subtree productCount (PUBLISHED, non-deleted products) in ONE raw SQL statement with a
  recursive CTE; registered as queue worker `catalog.refresh-counts`. Every admin write
  invalidates the `navigation:` cache prefix and enqueues the job (fire-and-forget) via
  `afterCatalogWrite()`.
- **Slug changes** — PATCH with a new slug updates `pathSlugs` for the category and all
  descendants and upserts CATEGORY `SlugRedirect` rows (old→new) in the same transaction
  (spec 13.6). Move writes redirects too (any path change breaks old URLs the same way).
- **Audit** — every admin write calls `writeAudit(actorId, action, entity, entityId, diff, ip)`
  from `src/services/audit` inside the write transaction.
- **Media URLs** — `public-id.util.ts` maps `iconPublicId`/`imagePublicId` to `/media/{publicId}`;
  the real MediaUrlBuilder (media service phase) swaps in at that single point.

## Gotchas

- Category detail responses are a superset of `CategoryDto` (+`path`, +`children`) — the
  shared DTO file is frozen, extensions live here.
- `parentId` is NOT patchable on `/admin/categories/:id`; reparent via `/admin/categories/move`.
- Codes are hierarchical digit pairs (`^\d{2}(-\d{2})*$`, e.g. `10-05-03`); unique across
  soft-deleted rows too.
- `brandsForCategory(code)` (repository `listBrandsForSubtree`) is exported for the products
  module's brand facets; it is intentionally unrouted here.
