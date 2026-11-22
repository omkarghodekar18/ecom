# cms module

Storefront content: the homepage composition (banners + category tiles), block-based
CMS pages and banner reads per placement, plus admin CRUD for banners and pages.
Spec Sections 11 (admin) and 15/22 (public surfaces).

**Public API** (`index.ts`): `cmsRouter` (mount at the API root), `cmsService`,
`cmsRepository` (+ `bannerWindowFilter`), input schemas, `parseBlocks`,
`AdminBannerDto`.

**Mounting:** the router owns its whole sub-path space (`/cms/…`, `/banners`,
`/admin/banners…`, `/admin/cms/pages…`), so mount it at the API prefix itself —
`app.use(API_PREFIX, cmsRouter)`.

## Endpoints (all under `/api/v1`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/cms/home` | public | `HomeDto`: banners per placement (heroes/sideTop/sideBottom/highlights) + top-level category tiles + SEO; cached 5 min under `cms:home` |
| GET | `/cms/pages/:slug` | public | `CmsPageDto` (PUBLISHED only, drafts 404); blocks parsed against the six-type registry, unknown/malformed dropped + logged (spec 6.11) |
| GET | `/banners?placement=` | public | `BannerDto[]` of one placement; active + scheduling window; sortOrder-ordered; `image` is a resolved URL |
| POST | `/admin/banners` | STAFF+ADMIN | 201 `AdminBannerDto` (BannerDto + row id); `startsAt`/`endsAt` optional (null = unbounded) |
| PATCH | `/admin/banners/:id` | STAFF+ADMIN | partial update; field-level audit diff |
| DELETE | `/admin/banners/:id` | STAFF+ADMIN | hard delete (Banner has no soft-delete columns) |
| POST | `/admin/cms/pages` | STAFF+ADMIN | upsert by slug — 201 created / 200 updated; blocks must match the registry (400 otherwise) |
| PATCH | `/admin/cms/pages/:slug` | STAFF+ADMIN | partial by slug (title/blocks/seoTitle/seoDescription/status); DRAFT hides the page immediately |

## Key flows

- **Block registry** — `CmsBlockSchema` (shared DTO) is a `z.union` of the six seeded
  block shapes: `hero`, `richText`, `imageText`, `cardGrid`, `ctaBanner`, `faq`. Reads
  `safeParse` every stored block; anything else is skipped and logged — a corrupt row
  degrades gracefully instead of 500ing. Admin writes validate against the same schema
  strictly (unknown types never enter the DB through the API).
- **Banner scheduling** — a banner is visible when `isActive` AND (`startsAt` null or
  ≤ now) AND (`endsAt` null or ≥ now); Prisma NULL comparisons exclude rows, hence the
  explicit null branches in `bannerWindowFilter`.
- **Home cache** — `GET /cms/home` wraps in `cache.wrap('cms:home', 5 min)`; every
  admin write (banner or page) invalidates the whole `cms:` prefix in-process.
- **Home SEO** — a PUBLISHED page with slug `home` overrides `seoTitle`/`seoDescription`
  when set; otherwise documented defaults apply.
- **Audit** — every admin write calls `writeAudit(...)` inside the write transaction
  (`banner.*` / `cms_page.*`, entities `banner` / `cms_page`).

## Gotchas

- `BannerDto.image` is the resolved `/media/{publicId}` URL (via the catalog module's
  `public-id.util.ts`); the raw `imagePublicId` never appears in public responses.
- CMS *blocks* keep `imagePublicId` verbatim — the block payload is the authored
  content; only banner images resolve server-side.
- `cardGrid` cards seeded without `href` normalise to `href: null` on read.
- Category tiles use the maintained `productCount` column (refreshed by the catalog
  queue job / seed maintenance SQL), not a live count.
