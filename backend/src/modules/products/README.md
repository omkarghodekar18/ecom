# products module

Product families and variants — the shop's merchandise domain. Public reads
(PDP by slug, variant by articleNo, category/brand subtree listings with
attribute filters, related products) plus the admin back-office CRUD for
products, variants, image/document lists and tier prices. Spec Sections 12
and 15.4/15.5.

**Public API** (`index.ts`): `productsRouter` (mount at the API root),
`productsService`, `productsRepository` (+ row types), the zod input schemas,
`parseListingQuery` (the listing query-string parser).

**Mounting:** the router owns its whole sub-path space, so mount it at the API
prefix itself — `app.use(API_PREFIX, productsRouter)`. The `/categories/:code/products`
and `/brands/:slug/products` children belong to this module; they do not collide
with the catalog module's `/categories/:code/*` reads or the brands module's
`/brands/:slug` read.

## Endpoints (all under `/api/v1`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/products/:slug` | public | PDP payload (PUBLISHED only, else 404): brand, category path, images, documents, active variants (+ attribute values, tiers, availability), techData |
| GET | `/variants/:articleNo` | public | one variant by exact articleNo (public visibility rules apply) |
| GET | `/products/:slug/related` | public | up to 8 related products (same category, same brand preferred, self excluded) |
| GET | `/categories/:code/products` | public | subtree listing — rich query string, see below; `meta` carries pagination |
| GET | `/brands/:slug/products` | public | the same listing scoped to one brand |
| GET | `/admin/products` | STAFF+ADMIN | back-office table: `q` (name/articleNo prefix), `brandId`, `categoryId`, `status`, `stock=low`, `sort` (name/createdAt/updatedAt), `order`, pagination |
| POST | `/admin/products` | STAFF+ADMIN | 201; slug auto from name; category must be an active leaf; audited |
| PATCH | `/admin/products/:id` | STAFF+ADMIN | partial; slug change writes a PRODUCT redirect; sanitized HTML; audited diff |
| DELETE | `/admin/products/:id` | STAFF+ADMIN | soft delete incl. variants (minPrice cleared); 409 when already deleted |
| POST | `/admin/products/:id/variants` | STAFF+ADMIN | 201; articleNo/EAN/variant-axis uniqueness (409 with details); mapping-validated attributes; recomputes minPrice |
| PATCH | `/admin/products/:id/variants/:variantId` | STAFF+ADMIN | partial; `attributes` merge-replaces; minPrice recomputed |
| DELETE | `/admin/products/:id/variants/:variantId` | STAFF+ADMIN | soft delete; 409 when it is the last active variant |
| PUT | `/admin/products/:id/images` | STAFF+ADMIN | REPLACES the image list (body = bare array); publicId/variantId validated |
| POST | `/admin/products/:id/documents` | STAFF+ADMIN | REPLACES the document list (same semantics as the images PUT) |
| PUT | `/admin/products/:id/price-tiers/:variantId` | STAFF+ADMIN | REPLACES the tier list; quantities must strictly increase |

## Listing query string

`page` / `pageSize` (defaults 1/24, capped at 100), `sort`
(`relevance`|`price_asc`|`price_desc`|`name`|`bestseller`|`newest`),
`inStock=true|false`, `brand=slug-a,slug-b` (multi-select, category listing
only) and `q` (reserved for the Phase-5 text search — parsed so it is never
treated as a filter, but it does not affect results yet). **Every other query
key is an attribute filter**: `key=v1,v2` (STRING/ENUM, OR inside the value
set), `true`/`false` (BOOLEAN) and `key_min`/`key_max` (inclusive NUMBER
ranges). Filters AND across attributes and match a product when ONE active
variant matches ALL predicates. Unknown keys and type misuse → 400 with
details (validated in the service against the category's effective mapping).

## Key flows

- **Two-step listing** — the service first narrows candidate ids by base
  filters (published, active subtree, brand, inStock), then applies the
  per-variant attribute predicates, then pages/sorts. `facets: []` is reserved
  for Phase 5.
- **Active-subtree scoping** — `productsRepository.listActiveSubtreeIds` BFSes
  the category tree and stops at inactive/deleted branches, mirroring the
  category product-count refresh job.
- **minPrice denormalisation** — every variant write recomputes
  `product.minPrice` (MIN listPrice over active variants) inside the same
  transaction (`recomputeProductMinPrice`).
- **Post-write hooks** — every admin write runs `afterCatalogWrite()` (drops
  the `navigation:*` cache and enqueues the subtree product-count refresh).
- **Audit** — `product.*` / `product.variant.*` / `product.images.replace` /
  `product.documents.replace` / `product.price-tiers.replace` entries are
  written inside each write transaction.

## Gotchas

- Product documents have no timestamps/sortOrder — the document list is
  ordered deterministically by `id` (the schema has no `createdAt`).
- The variant mapper accepts both `VariantDetailRow` and the PDP detail row's
  nested variant shape (`VariantDtoRow` = VariantDetailRow minus `product`).
- Effective prices (customer > tier > list) live in the **pricing** module
  (`POST /pricing/resolve`), not here.
