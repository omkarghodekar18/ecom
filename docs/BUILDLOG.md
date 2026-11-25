# Build log (spec Section 0.2: per-phase reports)

## Phase 1 — Foundation — DONE (2026-11-21)

**Built:**
- `backend/`: npm project (ESM, TS strict), zod-validated env (fail-fast), pino logger, stable
  error-code registry, AppError + centralized error handler (AppError/Zod/Prisma mapping),
  response envelope + pagination, request-id, rate limiting (general + auth factory),
  Prisma client singleton + `withTransaction`, health module (`/health`, `/health/ready`),
  OpenAPI registry + Swagger UI at `/api/docs`, graceful shutdown.
- Database: spec schema verbatim + documented additions (ADR 0003) migrated
  (`20261121040000_init`), raw-SQL `20261121040001_search_and_perf` (pg_trgm, unaccent,
  trigger-maintained weighted `searchVector`, trigram + partial + FK indexes) — search stack
  verified with a live smoke test (A-weight rank, article-no search, typo similarity).
- Infra services: cache (LRU/TTL), queue (pg-boss + inline test mode), mail (file/smtp
  providers + typed templates + preview script), settings (DB-backed, cached, defaults).
- `frontend/`: Next.js 16 project, design tokens (`tokens.css` per spec Section 4: #FF7000
  brand, navy badge, stock colors, 2px radii, 1440px container), Roboto via next/font,
  brand config (`config/brand.ts`, neutral placeholder identity), site/i18n config, URL
  builders, typed api-client (envelope-aware, cookie forwarding), custom next/image loader
  (Cloudinary + local adapter), proxy.ts (locale redirect, auth fast-gate), 24 UI primitives
  (Button…DataTable) + toaster (zustand), root/locale layouts, 404/error pages.
- Docs: README (quick start, env, folder map, Mermaid architecture), architecture, database,
  api, contributing + 10 ADRs.

**Verification (all green):** backend `tsc` / `eslint` / `vitest` (48 unit tests) / boots,
`/health` + `/health/ready` + `/api/docs` respond correctly; frontend `tsc` / `eslint` /
`next build` / dev server renders HTML with JS disabled (`curl`), root 307 → `/in/en`.

**How to run:** see README "Running locally" (pg-start.sh → backend db:migrate + db:seed →
backend dev → frontend dev).

**Next:** Phase 2 — Auth & users (register/verify OTP, password+OTP login, refresh rotation,
RBAC, mail integration, auth pages, guards, tests).

## Phase 2 — Auth & users — DONE (2026-11-21)

**Built:**
- Backend `auth` module: register (+B2B company creation with generated customer number) with
  generic anti-enumeration responses, email OTP verification (mandatory before activation),
  password login (argon2id, constant-time dummy hash for unknown emails), OTP login
  (request/verify), rotating refresh tokens with family-based reuse detection, logout/logout-all,
  forgot/reset password via OTP (revokes all sessions), `GET /auth/me`, brute-force lockout
  (≥5 fails/15 min per email and per IP), AuthEvent audit trail, argon2id password hashing.
- `users` (profile update, change password, session list/revoke with current-session marking via
  `sid` in the access JWT), `addresses` (CRUD, default swapping in a transaction, userId-scoped
  IDOR-safe access), `companies` (GET /companies/me with users) modules.
- Middleware: `authenticate` (Bearer JWT → req.userId/role/sid), `authorize(roles)`, CSRF
  double-submit for cookie-authenticated mutations. OpenAPI registration for all new routes.
- Frontend: auth store (in-memory access token), silent-boot session provider (single deduped
  refresh, status machine), `authFetch` with 401→refresh→retry, safe-redirect guard
  (open-redirect safe, unit-tested), login page (Password | Email OTP tabs, 60 s resend timer,
  EMAIL_UNVERIFIED handling), register page (B2B/B2C, verify step), forgot-password flow,
  account area (overview, profile, addresses, security with sessions, my-company) with sidebar
  shell + guest guard, noindex metadata.
- Fixes found by live verification: session cookies path `'/'` (ADR 0011); silent boot signals
  via readable `th_csrf`; test-env rate-limit scaling; ESLint node globals for .mjs.

**Verification:** backend tsc/eslint/madge/63 vitest (incl. 15 integration tests over the real
test DB covering OTP flows, rotation/reuse, CSRF, lockout, reset, IDOR, RBAC); frontend
tsc/eslint/10 unit tests/`next build`; live curl runs of the full auth lifecycle; UI login +
account area verified in a real browser (agent-browser).

**Next:** Phase 3 — Catalog core (categories, brands, attributes, products/variants, media
services + admin APIs, navigation tree, seed with ~200 products).

## Phase 3 — Catalog core — DONE (2026-11-21)

**Built:**
- `catalog` module: navigation tree (depth ≤5, cached 5 min), category detail/children/breadcrumb,
  effective filter set with ancestor inheritance; admin category management (create with computed
  materialised path/pathSlugs/level, update with slug-redirect records for the whole subtree,
  reorder, move with cycle protection, guarded soft delete); subtree product counts as one
  recursive SQL statement run by a pg-boss worker after every catalog write.
- `attributes` module (definitions CRUD with enum/type-change protection, category mapping
  replace API), `brands` module (public list with counts, admin CRUD with reference protection).
- `media` module + services: StorageAdapter (local files under var/uploads served at /media with
  ETag/immutable caching; Cloudinary REST signing without the SDK), MediaService with
  SSRF-guarded upload-from-URL (DNS-resolving IP range blocker, timeouts, size caps, magic-byte
  sniffing), sign-upload + binary upload endpoints, placeholder SVG generator, MediaUrlBuilder
  (ADR 0012).
- `products` module: product detail DTO (crumbs, variants with attribute maps, tech data,
  images/documents, priceFrom), variant by exact articleNo, related products; listing by category
  or brand with sort (relevance/price/name/bestseller/newest), inStock + brand + attribute
  (ENUM/STRING sets, NUMBER ranges) filters with product-level AND semantics; admin product CRUD
  (leaf-category enforcement, slug redirects, variant validation incl. GTIN checksums and
  variant-axis uniqueness, price tiers, images/documents replace) with minPrice maintenance.
- `pricing` module: resolve endpoint (customer price → quantity tier → list; basis reporting),
  pure engine unit-tested.
- Seed (spec Section 22 fully met): 163 categories (8 top-level, full Machining subtree to level
  3, partial subtrees for the rest), 10 brands, 11 attributes + 19 mappings, **211 products /
  767 variants** (flagship Centre drill HSS-E A TiAlN with exactly 11 variants, from
  INR 2302.30, first variant 2357.30, mixed availability), 2218 attribute values, 75 price tiers,
  399 placeholder images, 10 banners, 5 CMS pages, 4 accounts with 8 customer prices, valid
  sample-import.xlsx. Idempotent, runs in ~2 s.

**Bugs found by verification and fixed:** GTIN-13 rejected by a wrong EAN regex (8/12/14 only);
pg-boss workers registered at import time before start (deferred registration + queue start in
main); recursive navigation schema crashed the OpenAPI generator (depth-limited doc schema);
loose SVG sniffing; Prisma DbNull sentinels for Json columns.

**Verification:** backend tsc/eslint/madge clean; 161 tests green (44 unit + 117 integration incl.
catalog/products/pricing suites); live checks against seeded data (navigation 8 top-level,
listing 31 centre drills, PDP with 11 variants, variant by articleNo, customer pricing
2074.42/customer basis, /media SVG delivery).

**Next:** Phase 4 — Storefront browsing (layout, homepage, category pages, PDP, breadcrumbs,
SEO/JSON-LD, sitemaps, robots).

## Phase 4 — Storefront browsing — DONE (2026-11-21)

*(Entry written retroactively: the phase was built and browser-verified in the session that
ran out of context before its report could be filed; this session finished its remaining
scope — sitemaps + robots — and re-verified everything below.)*

**Built:**
- Storefront chrome: sticky site header (orange bar, pill search, account menu, cart link,
  locale picker), full navigation drawer (mega-menu frames + teasers from the navigation
  tree), site footer, cookie consent.
- Homepage: CMS block renderer (hero slider, banner cards, brand row, CTA bands, SEO text),
  category tile grid from the navigation tree, quick-order widget.
- Category pages: breadcrumb → H1 → subcategory tiles (non-leaf) → Filter & Sort bar
  (dropdown per group + full-height drawer with live count) → active filter chips →
  list/tile listing → pagination; URL-driven filter state (`lib/filter-url` codec),
  ISR 10 min tagged `category:{code}`; wrong slug paths 301 to canonical.
- PDP: gallery, buy box with variant selector + resolved customer pricing, tech-data
  table, tabs (description/downloads/compare), related carousel, recently viewed,
  sticky mobile bar, JSON-LD (Product + BreadcrumbList).
- Brands index + brand detail; CMS content pages (`/e/{slug}`); 404/error pages.
- SEO: per-page metadata + canonicals, breadcrumbs + JSON-LD everywhere,
  **sitemap chunk feed consumed by `app/sitemap.ts`** (one Next sitemap file per backend
  stream: categories/products/brands/cms, max 45k URLs each, + static chunk; Next 16
  passes sitemap ids as Promises — awaited) and **`app/robots.ts`** (allows storefront,
  disallows `/api/`, search + account/auth paths; lists every sitemap chunk).
- Bug fixed on re-verification: the category catch-all rendered the Filter & Sort bar
  TWICE (standalone + inside CategoryListing) — removed the duplicate.

**Verification:** frontend tsc/eslint/46 vitest (incl. filter-url codec suite)/`next build`
(route map incl. `/[country]/[lang]/search`, `/robots.txt`, 5 sitemap chunks); live checks
over the seeded backend: home/category/PDP/brands/CMS pages + robots.txt + sitemap XMLs
(211 product URLs) all 200 with correct content; search box + filters + pagination +
drawer live-count verified in a real browser (agent-browser).

**Next:** Phase 5 — Full-text search + facets (Postgres engine over searchVector, search
page, header autocomplete, exact-article fast path).

## Phase 5 — Full-text search & facets — DONE (2026-11-21)

**Built:**
- Backend `search` module (spec 12/6.5): `GET /search` (ranked listing — same shape, filter
  semantics and DISJUNCTIVE facets as the category listing — plus `exactArticleNo`),
  `GET /search/suggest` (5 products / 4 categories / 3 brands, image URLs resolved),
  `GET /search/filters` (global filter set as CategoryAttributeDto rows). Ranking over the
  trigger-maintained weighted searchVector: +3 articleNo-prefix/exact-EAN, +2 FTS
  (websearch_to_tsquery + unaccent), +1 pg_trgm name similarity; ties on ts_rank → sim → id.
  `relevance` keeps the ranking order through the filter replay (all id-list steps preserve
  order; page rows re-ordered in memory); other sorts reuse `orderByFor`.
- Engine seam: `SearchEngine` interface (`search.types.ts`) — everything above the
  repository depends on it; `PostgresSearchEngine` is the single binding.
- Candidate cap 500 (Meilisearch-style maxTotalHits) keeps ranking/facets bounded.
- Frontend: `/search` results page (noindex/follow, SearchAction JSON-LD, exact-article
  "Go to product" banner, search-specific empty states), header autocomplete with grouped
  dropdown + full keyboard navigation (combobox/listbox ARIA), `q` passthrough through the
  whole filter stack (`FilterState.q` — every filter interaction, chip removal, drawer
  clear-all and pagination keep the term; `isFiltered` ignores it).
- Filter drawer generalized: live-count endpoint is a `countPath` (category or `/search`),
  so the search page's drawer previews term-scoped counts.
- Shared DTOs re-mirrored (search/seo/cms now in frontend/src/shared); `npm run
  openapi:export` implemented (`scripts/export-openapi.ts` — side-effect imports of all
  module registrations, writes `docs/openapi.json`, 64 paths); stale Phase-5 notes removed
  from the products OpenAPI description/orderByFor comment.

**Fixes found on the way:** the leftover search stub broke `tsc` (`Sort` imported from
products barrel instead of the shared DTO) — baseline restored first; `filter-drawer`'s
clear-all now keeps `q`.

**Verification:** backend tsc/eslint/madge clean; **183 vitest green** (incl. new 10-case
search integration suite: FTS ranking, draft exclusion, exact articleNo + EAN fast path,
brand/inStock/attribute filters with identical 400s, price_asc, q validation, suggest
groups with image resolution, global filters endpoint). Live: `q=drill` → 89 ranked
results + 8 facet groups; `q=111100 0,5` → exactArticleNo + flagship PDP;
`q=drill&coating=TiAlN&brand=garaveta` → 8; suggest/filters endpoints; 400s validated.
Frontend tsc/eslint/46 vitest/`next build`; browser: autocomplete dropdown (ARIA +
ArrowDown/Enter → PDP), filter/chip/inStock/pagination all keep `q` in the URL, Escape
closes, zero console errors.

**Next:** Phase 6 — Carts & checkout (guest carts, pricing resolve at checkout, orders),
then the Excel/CSV import pipeline, the admin panel UI and ISR tag revalidation.

## Phase 6 — Cart & checkout — DONE (2026-11-21)

**Built:**
- Backend `cart` module (spec Section 11): guest carts keyed by the HMAC hash of
  a 60-day httpOnly `th_cart` cookie, user carts by userId; add/patch/delete
  lines; `POST /cart/merge` (login: sum quantities per variant under the rules,
  guest cart deleted, cookie cleared, one transaction); `POST /cart/import-csv`
  (up to 200 articleNo+qty lines, per-line results); server-side pricing on
  every read via the pricing ladder; quantity rules (minOrderQty, packSize
  multiples, STOCK_ONLY clamping) reported as `warnings[]` (adjustments) or
  409 OUT_OF_STOCK; IDOR-safe item access scoped to the caller's cart.
- Backend `checkout` module: `POST /checkout/validate` (pre-flight + totals
  preview), `POST /checkout/place-order` — ONE transaction re-prices every line
  (customer price → tier → list), re-validates stock/min-order, writes
  Order + snapshot items + the first OrderEvent, decrements stock (negative =
  open backorder under ALLOW_BACKORDER), clears the cart; ORD-YYYY-NNNNNN from
  the per-year OrderSequence counter (atomic increment); idempotencyKey replay
  (unique on Order, owner-checked); confirmation email enqueued post-commit
  (`order.confirmation` pg-boss worker, registered at import like catalog).
  PaymentProvider abstraction: INVOICE + REQUEST (offline B2B) and a real
  Razorpay REST adapter (gateway order + signature verify endpoint) behind the
  `razorpayCheckout` feature flag — off by default.
- Backend `orders` module: `GET /orders` (paginated), `GET /orders/:orderNo`
  (detail + status timeline, owner-scoped ORDER_NOT_FOUND), reorder.
- Backend `quick-order` module: `POST /quick-order/validate` with comma/dot
  article-number expansion ("111100 0,5" ↔ "111100 0.5").
- Backend `settings` module: public `GET /settings/commerce` (tax rate,
  delivery rates incl. optional express, payment availability + key id).
- Schema (documented addition): `Order.idempotencyKey` unique,
  `OrderEvent` timeline table (migration 20261121040100); shipping settings
  gained optional `expressRateInr`; cart DTO carries `productSlug`, listing
  DTO `firstVariantId` (single-variant rows add directly to the cart).
- Mail: `order-confirmation` HTML+text template wired into the typed mail map.
- Frontend: cart feature (query + mutations with cache writes, warnings as
  toasts), mini-cart popover + live header badge, direct-purchase quick-entry
  popover, cart page (qty steppers, warnings, CSV export, guest → login
  hand-off), checkout stepper (saved/new address incl. GSTIN, standard/express,
  invoice/request/razorpay, review with PO number, idempotency key, Razorpay
  checkout.js flow when enabled), success page, quick-order page (3 tabs: rows
  with live validation, CSV upload with template, paste form), order history +
  detail (status timeline, reorder, invoice placeholder) in the account area.
  PDP buy box, sticky bar and single-variant listing rows now add to the cart.
  Auth provider merges the guest cart on every login path; dates format in IST
  to keep SSR/hydration in sync.
- Docs: OpenAPI re-exported (77 paths); module READMEs (cart, checkout, orders,
  quick-order, settings).

**Verification:** backend tsc/eslint/madge clean, **219 vitest green** (36 new:
pure rules suite + cart→merge→checkout→orders integration over the real test
DB incl. price re-validation, stock decrement, order-number shape, email in the
outbox, idempotent replay, STOCK_ONLY rejection, express-flag flip); frontend
tsc/eslint/46 vitest/`next build` (new routes incl. /cart, /checkout,
/checkout/success/[orderNo], /quick-order, /my-company/orders[/orderNo]).
Live in a real browser: guest add on the flagship PDP → badge + toast →
mini-cart → cart page (server-priced 2074.42 customer basis after login merge)
→ guest checkout redirect to /login?redirect= → sign-in → merged cart on
checkout → new-address form → place order ORD-2026-000002 → success page →
order history + quick-order validation ("111100 0.5" → Centre drill, 8 in
stock). Hydration warning on dates fixed (IST formatting); zero console errors.

**Next:** Phase 7 — Admin panel (dashboard, product/category/brand/attribute
management UI, orders admin, customers/companies, settings, audit log viewer,
on-demand revalidation webhook).

## Phase 7 — Admin panel — DONE (2026-11-22)

**Scope delivered (spec Section 15):** back-office under `/admin` (separate
`(admin)` route group outside the locale segments, `noindex`, server-side
session guard redirecting non-STAFF/ADMIN) with a role-aware sidebar shell.

- Backend `admin` module: `GET /admin/stats` (catalog counts, orders 30 d,
  revenue, pending, failed imports, latest orders, low-stock list);
  orders admin (filtered list + CSV export, detail with buyer + timeline,
  PATCH status through a validated state machine, resend-email through the
  queue); users/companies admin (ADMIN-only: list, activate/deactivate with
  self-guard, role changes, company edits); audit-log viewer with filters;
  settings admin (per-key zod, audited, public `GET /settings/commerce`).
- Revalidation: `services/revalidate` posts `revalidateTag` to the Next.js
  `/api/revalidate` webhook after catalog writes; `GET /auth/session`
  resolves the refresh cookie for the admin layout guard without rotation.
- Product bulk + duplicate (spec 15.2): `POST /admin/products/bulk`
  (PUBLISH/UNPUBLISH/ARCHIVE/RESTORE/DELETE/MOVE with categoryId validation,
  ≤ 200 ids/txn, per-action audit, counts only real changes, missing ids
  skipped) and `POST /admin/products/:id/duplicate` (deep copy → DRAFT,
  suffixed article numbers `-C`, `-C2`…, EANs cleared, images/documents
  shared by publicId, tiers + attribute values copied, minPrice recomputed).
- Frontend admin (10 sections): dashboard KPIs; products list (search,
  brand/status/low-stock filters, pagination) + tabbed product form
  (General / Variants & attributes / Images / Documents / Pricing / SEO)
  with variants inline grid, media tabs and create-then-redirect flow;
  categories drag tree (move/reorder/create/edit/delete + attribute
  mapping editor with inheritance); brands; attributes definitions CRUD;
  content (banners + CMS pages); orders list/detail (status transitions,
  resend email, CSV export); customers & companies; settings; audit log.
  Bulk-action bar with confirmation modal and duplicate action on the
  products list.
- Fixes found during verification: `navigation/tree` depth cap raised 5 → 10
  (the admin tree fetches the full 163-node tree); revalidate secret synced
  between `backend/.env` and `frontend/.env.local`; `product-form.tsx` was
  committed mid-refactor with a syntax error — rewritten as
  ProductForm/ProductFields; `resetDb` now clears `Setting` rows (the
  settings round-trip test leaked a 300 INR flat rate into the cart-checkout
  suite); 2 lint errors in the admin module fixed.

**Verification:** backend tsc/eslint/madge clean, **234 vitest green**
(15 new: bulk archive/publish audit + idempotent re-run, MOVE validation,
DELETE → RESTORE round-trip, duplicate article suffixing/EAN clearing/tier
copy, RBAC 403s); frontend tsc/eslint/46 vitest/`next build` green
(new routes: /admin, /admin/products[/new|/:id], categories, brands,
attributes, content, orders[/orderNo], customers, settings, audit).
Live browser as admin@example.com: dashboard (211/211 published, 767
variants, low-stock list) → products (duplicate "Anti-spatter spray" →
DRAFT copy; bulk archive 1 → status flips + toast; bulk delete cleans up) →
categories full tree renders with per-row actions → orders (empty state) →
settings (tax/shipping/stock/flags) → customers → audit log showing the
session's product.duplicate/bulk_status/delete entries; zero console
errors.

**Next:** Phase 8 — Import automation (Section 16): template generator,
xlsx/csv parsers, 5 validation layers, dry-run report + error xlsx, batched
commit, rollback, Import Center UI, fixtures and per-error-code tests.

## Phase 8 — Import automation — DONE (2026-11-22)

**Scope delivered (spec Section 16):** the `imports` module
(`backend/src/modules/imports/` with parsers/ schemas/ validators/ committers/
reports/ templates/ jobs layout per 16.4) + the Import Center UI at
`/admin/imports`.

- **Pipeline** (16.4): parse → normalize + validateSchema → validateRefs →
  validateUniqueness → validateBusiness → plan (diff: create/update/skip) →
  commit (500 rows/transaction) → postProcess (minPrice refresh, category
  counts, ISR revalidation, URL-image uploads with per-image isolation).
- **Parsers**: streaming exceljs WorkbookReader (cached values only, formula
  cells detected + warned) with a buffered fallback for re-saved workbooks;
  RFC-4180 CSV parser for flat Variants-style files (product fields grouped
  by product_key, UTF-8/BOM validated). Sheet-aware header aliases
  ('price' = list_price on Variants/CSV but stays 'price' on
  PriceTiers/CustomerPrices; 'url' = image_url only on Images).
- **Validation layers (all with stable codes from `IMPORT_CODES`)**:
  L1 pre-parse (extension, magic bytes, 25 MB, macro/encryption sniffing) +
  post-parse (required sheets/headers, unknown columns, 50k row limit, empty
  file); L2 zod-per-sheet (GTIN checksum, price separators incl. unambiguous
  Indian/EU grouping, booleans, https+allow-list+extension URLs, HTML
  sanitise with warning, enums, dates); L3 referential (category
  exists/active/leaf, brand policy, product_key → DB slug, attribute mapping
  + enum/number/unit, required + variant-axis attributes, axis-combination
  uniqueness, bulk-loaded context — no N+1); L4 uniqueness (in-file
  duplicates with ALL rows reported, DB conflicts, per-policy UPDATE/SKIP/
  FAIL, slug-suffix warning, ALREADY_IMPORTED by SHA-256); L5 business
  (lead-time order, min-qty/pack multiples, tier quantity/price ordering,
  customer price vs list, date ranges, image limit, published-no-variant
  error / no-image warning).
- **Lifecycle**: upload (base64 JSON, file in `var/imports/`, SHA-256) →
  dry run on the queue (inline in dev/tests) → report persisted as
  `ImportIssue` rows + plan in `stats` → commit guarded by
  READY_TO_COMMIT + one-at-a-time lock, re-validates L3–L5 (fails
  VALIDATION_CHANGED if the catalog moved), batches of 500 rows/txn, every
  written row snapshotted in `ImportBatchItem.previous`, progress % on the
  job → ADMIN-only rollback restoring snapshots in reverse order (refused
  when a newer import completed) → cancel for non-terminal jobs.
- **Template generator**: .xlsx with README sheet (rules + enumerations),
  data-validation dropdowns (booleans, status, attribute enums), header
  comments, example row, optional category-specific attr columns
  (`?categoryCode=`). **Error report**: downloadable .xlsx — Summary sheet
  grouped by code + original rows with an `Errors` column.
- **API** (OpenAPI registered; 89 paths total): POST /admin/imports,
  GET list/template/:id/:id/report, POST :id/commit (STAFF+),
  :id/rollback (ADMIN), :id/cancel.
- **Import Center UI**: template download, upload with the four options,
  live-polled job table, report with severity filter + per-issue code
  table, error-xlsx download, commit/rollback/cancel with confirmation
  modals; ADMIN-gated rollback button; nav entry in the admin shell.
- **Fixtures + tests**: `tests/fixtures/import/` ships valid.xlsx +
  19 invalid-*.xlsx (one per error class; generator committed) and the
  seed's sample-import.xlsx was corrected to be truly valid (jobber family
  no longer carries an unmapped attribute; Jobber drills doesn't map
  drilling_tool_type). New suites: 16 unit tests (every stable code through
  the pure layers) + 35 integration tests (full lifecycle, per-fixture
  codes, duplicate policies, idempotency, CSV mode, RBAC, rollback round-
  trip, report content). **Imports module coverage: 91% lines.**
- Test isolation: `resetDb` also clears Setting/ImportJob/ImportBatchItem
  rows now.

**Verification:** backend tsc/eslint/madge clean, **285 vitest green**
(51 new); frontend tsc/eslint/46 vitest/`next build` green (new route
/admin/imports). Live browser as admin@example.com: template download →
upload sample-import.xlsx → dry run report (0 errors, 3 warnings incl.
PUBLISHED_NO_IMAGE) → commit (11 rows: 3 products DRAFT, 8 variants,
minPrice 1180.50/940/310.25, 11 batch snapshots) → status COMPLETED with
toast → rollback ("11 rows restored", sample products soft-deleted,
variants removed). Zero console errors.

**Next:** Phase 9 — hardening: Playwright e2e suite, security/performance/
accessibility pass, Lighthouse sanity, documentation completion, final
spec cross-check and report.

## Phase 9 — Hardening — DONE (2026-11-22)

**Scope delivered (spec Section 24.9):** e2e suite green, security review,
performance (Lighthouse/CWV) + accessibility pass, load sanity test,
documentation completion, final README. Environment recovery included: the
sandbox recycle had wiped node_modules in all three projects, the .env files
and Postgres' empty runtime directories (data restored via npm install +
recreated `pg_{notify,stat_tmp,logical/…}` dirs + fresh .env from examples).

- **Playwright e2e (spec 21)** — `frontend/e2e/` (shopper + admin suites,
  chromium, workers=1, `reuseExistingServer` web-server config, trace on
  failure). 7/7 green:
  - shopper: home skeleton; category drill-down (drawer → Centre drills
    listing with article no. + price rows); PDP variant switch (pressed
    state + technical data); guest cart → checkout login redirect → OTP
    login (code read from the file-mail outbox, `waitForNewMail` guards
    against stale codes) → new address + invoice payment → place order →
    `ORD-YYYY-NNNNNN` on the success page → order history.
  - admin: password login; create product (+ image upload + variants tab);
    import valid workbook end-to-end (dry run → report → commit → rollback,
    row-scoped so old jobs can't be picked up); import invalid workbook
    (EAN_CHECKSUM in the report + .xlsx error report download).
- **Real bugs the e2e suite surfaced and fixed:**
  1. `proxy.ts` redirected unauthenticated `/admin/*` to a nonexistent
     `/admin/login` (storefront 404) → now `/in/en/login?redirect=…`.
  2. Cart calls went out without the bearer for signed-in users (guest
     cookie consumed by the merge → permanently "empty" cart): all cartApi
     calls now use `authFetch`, and `useCart` waits for the silent boot
     refresh (`status !== 'loading'`).
  3. Import Center report panel never refreshed once a job transitioned
     (detail query had no polling) → polls at 1.5 s while in-flight.
- **Dev/e2e affordance:** `backend/scripts/reset-otp-rate-limit.cjs`
  (localhost-guarded) + playwright `global-setup` reset the OTP send-limit
  counters (5/h per email AND per IP) that repeated runs otherwise exhaust.
- **Security review (spec 23):** `docs/security-review.md` — checklist
  verified item by item (zod validation, sanitisation, Prisma parameterised,
  secure cookies, CSRF, CORS allow-list, helmet, rate limits, secrets in
  env, signed Cloudinary uploads, upload hardening, SSRF gate on media
  fetches, open-redirect guard, IDOR scoping, audit logs, PII redaction in
  pino). Dependency audit: frontend 0 vulns; backend 6 (dev-CLI/transitive
  only — Prisma CLI `deepmerge-ts`/`effect`, `exceljs`→`uuid` edge) with a
  documented accept/monitor decision. Also fixed en route: the global
  rate limiter never skipped health probes (`/api/health` vs `/api/v1/health`)
  and the limit is now env-tunable (`API_RATE_LIMIT`, default 300).
- **Lighthouse (spec 13.8/21, prod build, Playwright Chromium):** after
  fixing generic "Learn more" link text (sr-only context suffixes in CMS
  card/banner/hero fallbacks + cookie-consent aria-label):
  SEO **100/100/100** (≥95 ✓), Accessibility **95/94/94** (≥90 ✓),
  best-practices 96. Unthrottled: performance **100/100/100** with
  LCP 0.3/0.3/0.7 s, TBT 0/0/50 ms, CLS 0/0.001/0 — all CWV targets met
  with headroom (throttled 4x-CPU/slow-4G numbers recorded in the run logs).
- **Load sanity (autocannon, 10 conns × 10 s, dev server):** ~160k requests,
  zero errors — health 9.3k rps (p99 20 ms), navigation tree 3.3k rps
  (p99 27 ms, cached), facets 610 rps (p99 44 ms), product detail 163 rps
  (p99 111 ms), search 29 rps (p99 432 ms under saturation; 38 ms unloaded),
  category listing 46 rps (p99 301 ms saturated; 21 ms unloaded) — cached
  paths are flat and unbounded latencies are CPU queueing, not data-path.
- **Documentation:** new `docs/security-review.md`, `docs/seo.md`,
  `docs/deployment.md` (README already referenced them); READMEs for all 12
  frontend feature folders (backend modules already had theirs); ADR count
  stands at 12; root README quick start/scripts/env/folder map verified
  (incl. `scripts/pg-start.sh`).

**Verification:** backend tsc/eslint/madge clean, **285 vitest green**;
frontend tsc/eslint clean, **46 vitest green**, `next build` green;
**Playwright 7/7 green** twice consecutively (after a clean restart — an
orphaned `next start` had corrupted `.next` for the dev server, now
documented as a caution in the e2e README-worthy gotchas). Lighthouse and
load-test numbers above.

**All nine phases complete.** Spec cross-check: Sections 1–24 delivered as
per the per-phase reports above; the only intentional deviations are the
documented ADR decisions and the dependency-audit acceptances in
`docs/security-review.md`.

## Post-restore verification — DONE (2026-11-22, session 2)

The sandbox was recycled after Phase 9 (node_modules, Playwright browsers,
gitignored `.env` files and the Postgres data dir's runtime subdirectories
were lost; the DB data itself survived). Recovery + full re-verification:

- **Recovery:** `npm install` in backend/frontend/pgtest; recreated the
  `pg_*` runtime subdirs inside `scripts/pgtest/data` (empty dirs the
  reaper removed — `pg_notify`, `pg_logical/snapshots|mappings`, etc.);
  `chmod 700` on the data dir; recreated `backend/.env` +
  `frontend/.env.local` from examples (matching REVALIDATE_SECRET);
  `npx playwright install chromium`; `prisma generate` for dev.
- **Dev/e2e affordance:** `scripts/with-backend-build.sh` — runs
  `next build` with the backend up in one process tree (the sandbox reaper
  kills detached background servers between commands); Playwright's own
  `webServer` handles this for e2e.
- **Fix surfaced by the re-run:** the Import Center jobs table caps at 20
  rows/page, and repeated e2e runs had accumulated 20+ jobs in the dev DB,
  so the admin import e2e's row-count assertion (`before + 1`) could no
  longer observe the new job. The table now renders each job's id
  (`data-job-id` + short mono id — also useful for admins referencing a
  job), and both import e2e tests track the new row by **unique job id**
  instead of row count (pagination-proof, immune to same-named leftovers).
- **Verification:** backend `tsc`/`eslint` clean, **285 vitest green**;
  frontend `tsc`/`eslint` clean, **46 vitest green**, `next build` green
  (all `/admin` + SSG routes); **Playwright 7/7 green twice consecutively**
  — the second run re-proves the id-based tracking against a polluted
  jobs table.
- Dev DB state confirmed intact across the recycle: 238 products / 769
  variants / 163 categories / seeded admin.

## Fix: CORS allow-list wildcard support (2026-11-22, session 3)

**Symptom:** adding any item to cart from the hosted preview origin failed
with "Could not add to cart — Something went wrong on our side" while
browsing worked. Backend log showed
`Origin https://preview-chat-….space-z.ai not allowed by CORS` → the cors
middleware errored → 500 on every client-side mutation (browsers send
`Origin` on same-origin POSTs too; GETs/SSR were unaffected).

**Fix (meaningful, no dead code):** `CORS_ORIGINS` entries now support `*`
wildcard patterns (`isOriginAllowed()` in `config/env.ts`, used by the cors
middleware in `app.ts`; the previous exact-`includes()` call removed).
`https://preview-*.space-z.ai` added to the dev allow-list — no per-session
hardcoding. `.env.example` documents the pattern syntax.

**Tests:** new `tests/unit/cors-origins.test.ts` (4 tests: exact match,
wildcard match incl. empty `*`, boundary non-matches — wrong prefix,
suffix-appended attacker host, scheme mismatch). Backend 289/289 green,
tsc/eslint clean. Verified live end-to-end through the actual preview
gateway: add → get → update → remove cart items all succeed with
browser-like `Origin`/`Referer` headers; unknown origins still rejected;
Playwright 7/7 green (localhost path unchanged).

## Fix: recreate the postgres socket dir before pg_ctl start (2026-11-24, session 4)

**Symptom:** after a full sandbox recycle (node_modules, env files and the
`data/` dir all wiped) the embedded Postgres failed to come back up:
`FATAL: could not create lock file
".../pgtest/db-socket/.s.PGSQL.5433.lock": No such file or directory`.
`db-socket/` is empty whenever the server is down, and empty directories are
exactly what the recycle strips — `pg-start.sh` referenced the directory but
never created it.

**Fix (3 lines):** `pg-start.sh` now `mkdir -p` + `chmod 700` the socket dir
immediately before `pg_ctl start`. Recovery from a wiped sandbox is now fully
automatic: `npm install` ×3 → env from `.env.example` → `pg-start.sh`
(fresh initdb + `check.js` creates `toolhub`/`toolhub_test`) →
`db:migrate` + `db:seed` → `start-app.sh`.

**Tests (end-to-end, live):** fresh initdb → 28 migrations applied → seed
(163 categories / 10 brands / 211 products / 767 variants / 399 images) →
backend :4000 + frontend :3000 up via the daemon scripts. Storefront,
product, category, search and cart pages return 200; the full guest cart
lifecycle (add with preview `Origin` + stale cookie → 201, GET → 5 items,
re-add → 10, fresh visitor → new random `th_cart` token) passes through the
frontend proxy; CORS preflight 204 with allow-origin echo; admin login +
`/admin` 200 + imports API 200; media assets serve as `image/svg+xml` through
backend and proxy.

## Fix: seed idempotency on a used database (2026-11-24, session 4)

**Symptom:** `npm run db:seed` (documented in-code as idempotent — "variants
are rebuilt from scratch on every run") failed with a Prisma 23001 as soon as
any guest had cart lines: `delete or delete on table "Variant" violates
RESTRICT setting of foreign key constraint "CartItem_variantId_fkey"`.

**Fix (2 changes, both meaningful):**
- `prisma/seed/products.ts`: stale `CartItem` rows referencing the rebuilt
  variants are deleted before `variant.deleteMany` — the lines would dangle
  after the rebuild anyway; placed orders are untouched (OrderLine.variant is
  `SetNull` + snapshot fields).
- `prisma/seed/sample-import.ts`: `writeSampleImportWorkbook()` now skips
  when the file exists (ExcelJS embeds the creation timestamp, so every seed
  run dirtied the tracked `.xlsx`). Delete the file to regenerate.

**Tests:** re-seed on the live, cart-carrying dev DB succeeds; the xlsx stays
byte-identical across repeated seeds and regenerates when deleted; variant ids
rotate after re-seed and the guest cart flow keeps working with the old cookie
(GET → 0 items, add with new variant id → 201 through the frontend proxy);
`tsc --noEmit` clean; backend suite 289/289.

## Fix: consolidate all Postgres recovery into pg-start.sh (2026-11-25, session 5)

**Symptom:** after a recycle that wiped the pgtest `data/` dir entirely,
`start-app.sh` aborted (`cd: .../pgtest/data: No such file or directory`) —
its runtime-dirs restore block `cd`'d into the data dir before `pg-start.sh`
ever got the chance to initdb a missing one.

**Fix:** the restore block moved into `pg-start.sh` (guarded: only for an
existing `PG_VERSION`, alongside the socket-dir fix); `start-app.sh` now only
delegates. One script owns every recycle state: fresh (initdb), surviving
(runtime dirs + socket dir), running (no-op).

**Also this session:** the app now runs against Supabase Postgres
(`DATABASE_URL` → 6543 transaction pooler for Prisma runtime, `DIRECT_URL` →
5432 session pooler for migrations; seed run through the session URL since it
uses interactive transactions). End-to-end on Supabase: 28 migrations, full
seed (211 products / 767 variants), storefront/cart/admin flows, and the whole
pg-boss import lifecycle — upload → dry-run plan → commit (11 writes +
`web.revalidate` worker revalidated ISR tags on the frontend) → rollback
(`restored: 11`).
