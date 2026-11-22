# brands module

Brand metadata: public read-only surface (list with product counts, detail by
slug) plus admin CRUD. Spec Sections 11 and 15.

**Public API** (`index.ts`): `brandsRouter` (mount at the API root), `brandsService`,
`brandsRepository`, input schemas.

**Mounting:** the router owns its whole sub-path space, so mount it at the API prefix
itself — `app.use(API_PREFIX, brandsRouter)`.

## Endpoints (all under `/api/v1`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/brands` | public | all brands + `productCount` (PUBLISHED, non-deleted; groupBy on Product); cached 5 min under `brands:` |
| GET | `/brands/:slug` | public | one `BrandDto` (logo URL resolved); 404 when unknown |
| POST | `/admin/brands` | STAFF+ADMIN | 201; slug auto from name w/ unique suffix; 409 on duplicate name |
| PATCH | `/admin/brands/:id` | STAFF+ADMIN | partial update (name/slug/isPremium/logo/badgeColor/description) |
| DELETE | `/admin/brands/:id` | STAFF+ADMIN | hard delete; 409 while any product references the brand |

## Key flows

- **Counts** — the listing computes product counts via a single `groupBy` on Product
  (PUBLISHED, non-deleted), not per-brand queries; every admin write invalidates the
  `brands:` cache prefix.
- **Audit** — every admin write calls `writeAudit(...)` from `src/services/audit` inside
  the write transaction (`brand.*`).
- **Deliberately read-only for products** — brand-scoped product listing is the products
  module's concern (later phase); this module only serves brand metadata.

## Gotchas

- `BrandDto` (shared contract) has no `productCount`; the listing response is the
  documented superset `BrandDto & { productCount: number }`.
- Brand delete counts DRAFT and soft-deleted products too — any referencing row blocks
  with 409 (the FK has no cascade).
- Logo URLs resolve through the catalog module's `public-id.util.ts` (`/media/{publicId}`)
  until the media service ships its real URL builder.
