# MASTER BUILD PROMPT: B2B Industrial Tools eShop (Hoffmann-style)

You are a senior full-stack architect and engineer. Build the complete, production-grade system described below, end to end: frontend, backend, database, admin panel, bulk-import pipeline, SEO, docs, tests and deployment config. Work phase by phase (Section 24). Do not skip phases, do not leave `TODO`/stub/placeholder implementations, do not invent features outside this spec, and do not ask clarifying questions. Where this spec is silent, choose the most conventional, secure, scalable option and record the decision in `docs/adr/`.

---

## 0. HOW TO WORK

1. **First output a plan**: the final folder tree for `frontend/` and `backend/`, the list of modules, and the phase checklist. Then implement.
2. **Implement one phase at a time.** At the end of each phase: run lint, typecheck, tests and the app; fix everything; print a short "Phase N done" report (what was built, how to run it, what is next).
3. **Every file must be complete and runnable.** No pseudo-code, no "implement later".
4. **Keep files small and single-purpose** (target < 250 lines per file; split otherwise).
5. **Document as you go** (Section 20). Documentation is part of "done".
6. Use TypeScript `strict` everywhere. No `any` unless commented and justified.

---

## 1. PRODUCT OVERVIEW

A **B2B industrial tooling eShop** (cutting tools, measuring tools, clamping, hand tools, workshop equipment, etc.) in the style of the Hoffmann Group India eShop.

Key characteristics:
- Very deep category tree (5+ levels), 500,000+ products in scale (design for it; seed ~200).
- Products are **families** (e.g. "Centre drill HSS-E A TiAlN") with many **variants** (articles) differing by one or more attributes (e.g. nominal diameter 0.5, 0.75, 1 ... 5 mm). Each variant has its own article number, price, stock and lead time.
- Prices in **INR, excluding tax** ("plus VAT/GST at the current rate"). Logged-in business customers can see **individual (customer-specific) prices**.
- Heavy faceted filtering driven by technical attributes per category.
- Quick-order tools (article numbers, CSV upload).
- Guest browsing and guest cart; **login required only at checkout**.
- Full admin panel, including an **Excel/CSV bulk import** with strict validation.

### Branding and legal note
Do **not** copy any third-party logos, trademarks, product photos or marketing copy. Put all brand identity in a single config file `apps/web/src/config/brand.ts` (name, logo SVG, colours, contact details) with neutral placeholder values (default name: `ToolHub India`). The UI layout, structure and behaviour must match the specification below; the primary brand colour is orange `#FF7000`.

---

## 2. TECH STACK (fixed)

| Layer | Choice |
|---|---|
| Frontend | **Next.js latest stable (App Router)**, React, TypeScript strict |
| Styling | Tailwind CSS with design tokens (CSS variables), Radix UI primitives for accessible components, `lucide-react` icons |
| Client data | TanStack Query (client-side mutations and live data), Zustand (tiny UI state only: drawer, toasts) |
| Forms/validation | react-hook-form + zod (schemas shared with the backend via `packages/shared`) |
| Backend | **Node.js 22 LTS**, **Express 5**, TypeScript |
| ORM / DB | **Prisma** + **PostgreSQL** (works with any hosted Postgres, including Supabase; only `DATABASE_URL`/`DIRECT_URL` change) |
| Images | **Cloudinary** (signed uploads from admin, delivery via `next/image` custom loader) |
| Auth | Custom: email+password and email OTP, argon2id, JWT access token + rotating refresh token in httpOnly cookie |
| Email | Nodemailer behind a `MailProvider` interface (SMTP default; Resend adapter optional); MailHog for local dev |
| Jobs/queue | **pg-boss** (Postgres-backed; no Redis needed). Wrap behind `QueueService` interface |
| Excel/CSV | `exceljs` (xlsx read/write, streaming) and `fast-csv` |
| Logging | pino + pino-http; request IDs |
| API docs | zod-to-openapi, served via Swagger UI at `/api/docs` |
| Tests | Vitest (unit), Supertest (API integration, using a test DB), Playwright (e2e) |
| Tooling | npm (plain, per-project `package.json` — no workspaces/monorepo tool), ESLint, Prettier, Husky + lint-staged |
| Infra | Not a priority now — see Section 19 (kept minimal/optional, no Docker/CI setup required for the initial build) |

---

## 3. PROJECT STRUCTURE (two plain folders — NO monorepo, NO Turborepo, NO workspaces)

Two completely independent, standalone projects sitting side by side in one root folder. Each has its own `package.json`, its own `node_modules`, its own `.env`. They talk to each other only over HTTP (the frontend calls the backend's REST API via its public URL). Do **not** set up pnpm/yarn workspaces, Turborepo, Nx, or a shared `packages/` directory — any type/schema sharing (Section 9's zod schemas) is done by **duplicating** the small set of shared zod schemas into both projects under a `shared/` folder inside each, kept in sync manually, OR by simply re-declaring equivalent validation on each side. Keep it simple.

```
/ (root)
├─ frontend/                       # Next.js app (storefront + admin UI)
│  ├─ src/
│  │  ├─ app/                      # routes only (thin): see Section 7
│  │  ├─ features/                 # feature modules (UI + hooks + api calls per feature)
│  │  │  ├─ catalog/ product/ search/ cart/ checkout/ auth/ account/
│  │  │  ├─ orders/ quick-order/ cms/ navigation/ admin/
│  │  ├─ components/               # shared UI: ui/ (primitives), layout/, seo/
│  │  ├─ lib/                      # api-client, cloudinary loader, formatters, seo helpers
│  │  ├─ config/                   # brand.ts, site.ts, routes.ts, env.ts (zod-validated)
│  │  ├─ shared/                   # local copy of validation schemas/DTO types/enums mirroring the backend
│  │  ├─ styles/                   # globals.css, tokens.css
│  │  └─ types/
│  ├─ public/
│  ├─ package.json, tsconfig.json, next.config.ts, tailwind.config.ts, .env.local.example
│  └─ README.md
│
├─ backend/                        # Express API
│  ├─ src/
│  │  ├─ main.ts, app.ts, server.ts
│  │  ├─ config/                   # env.ts (zod), logger.ts, cloudinary.ts, mail.ts
│  │  ├─ common/                   # errors, middleware, utils, pagination, response envelope
│  │  ├─ modules/                  # one folder per domain (Section 9)
│  │  │  └─ <module>/ {<module>.routes.ts, .controller.ts, .service.ts, .repository.ts, .schemas.ts, .types.ts, README.md, __tests__/}
│  │  ├─ shared/                   # zod schemas, DTO types, enums, constants, formatters (source of truth; mirrored into frontend/src/shared)
│  │  ├─ jobs/                     # background workers (import, email, revalidate, image-cleanup) — see Section 17 note
│  │  └─ db/                       # prisma client singleton, transaction helper
│  ├─ prisma/ {schema.prisma, migrations/, seed/}
│  ├─ package.json, tsconfig.json, .env.example
│  └─ README.md
│
└─ docs/                           # architecture.md, api.md, database.md, import.md, seo.md, adr/
```

Rules: controllers parse/validate and delegate; **services hold business logic**; **repositories are the only layer that touches Prisma**. No cross-module imports of internals: modules talk through each other's `index.ts` public API only. Run each project independently (`cd frontend && npm run dev`, `cd backend && npm run dev`); document both in the root `README.md` with the two commands side by side and the `.env` values each needs, including the `NEXT_PUBLIC_API_URL` the frontend uses to reach the backend.

---

## 4. DESIGN SYSTEM (match the reference UI exactly)

**Typeface:** Roboto (via `next/font`, weights 400/500/700). 
**Tokens (CSS variables in `tokens.css`):**
- `--brand-orange: #FF7000` (header bar, primary buttons, active tab underline, links like "Show all", "Back", "To quick entry")
- `--text: #1A1A1A`, `--text-muted: #8A8A8A` (e.g. "More than 500,000 products." in grey)
- `--surface-tile: #F2F2F2` (category tiles, zebra rows), `--border: #D9D9D9`
- `--link-teal: #1F6F8B` (for "Individual prices for business customers after login.")
- `--stock-green: #3BA935`, `--stock-amber: #F5A800`, `--stock-red: #D32F2F`
- `--brand-navy: #00356B` (brand badge background, e.g. "Garant"-style badge)
- Radius: tiles 2px, buttons 2px, search pill fully rounded (999px). Container max width 1440px with 16px (mobile) / 32px (desktop) gutters.
- Headings: bold, H1 ~40px desktop / 28px mobile.
- Provide light theme only. Include `focus-visible` rings and AA contrast.

**Shared UI primitives (in `components/ui`):** Button (variants: primary-orange, outline, ghost, link), Input, Select/Dropdown, Checkbox, Radio, Badge (Bestseller, Brand, Variants count), Chip, Tabs (orange underline), Tooltip/Popover (dismissible orange-bordered "New:" popover), Drawer (left slide-over with dark overlay), Modal, Breadcrumb, Pagination, Skeleton, Toast, DataTable (admin), AvailabilityDot, PriceBlock, QuantityStepper, EmptyState, ErrorState.

---

## 5. GLOBAL LAYOUT SPEC

### 5.1 Header (sticky)
Two stacked bars:
1. **Orange bar** (`#FF7000`): logo (left, white) + **large pill search input** (full remaining width, white, search icon on left, placeholder: `Search term, product, article no., category, EAN/GTIN, brand...`). Search shows autocomplete (Section 12).
2. **White bar** with soft shadow: left: hamburger icon with label **Menu** (opens drawer), vertical divider, then text links: **Products, Fields of application, Services, Guides, Consulting and support, Company, Events**. Right (icon above label): **Direct purchase** (clock/refresh icon, opens quick-order popover), **IN (en)** (flag + country/language selector popover), **Sign in** (user icon; becomes account dropdown when logged in), **Shopping cart** (cart icon with item-count badge; opens mini-cart panel).
3. On mobile: orange bar with logo + icons, search below, nav links collapse into the drawer.

### 5.2 Slide-out navigation drawer (left, ~380px, dark overlay behind)
- Top: orange strip with white **X** close button.
- **Level 1 ("Main menu")**: header row with back-arrow + "Main menu". List of the 8 top-level categories, each with a 40px category icon, label and right chevron. Below the list: promo teaser cards (image + title + short text + underlined "Find out more" link) for featured brands/CMS pages (admin-managed `MENU_TEASER` banners). Below: secondary links (Account overview, Orders, Help/FAQ, Contact).
- **Level 2 ("Products")**: header row with back-arrow + "Products". Section title = parent category (bold) with orange **Show all** link at right; list of child categories with icons.
- Deeper levels follow the same pattern (drill-in with back arrow). Keyboard accessible, focus-trapped, `Esc` closes, body scroll locked.
- Data comes from a cached `/navigation/tree?depth=2` endpoint (lazy-load deeper levels on demand).

### 5.3 Footer
Columns: Company links, Services, Top product categories, "We're there for you" (Contact, Advice, Help/FAQ, Downloads, Newsletter), social icons, payment methods row, delivery-promise strip, legal row (Imprint, T&C, Privacy, Cookies). All content CMS/config-driven.

### 5.4 Breadcrumb component
Pattern: orange back-arrow + **Back** (history back), thin vertical separator, then `Homepage → Machining → Drilling → Drills → Centre drills` with arrow icons between items. Emits `BreadcrumbList` JSON-LD.

### 5.5 Cookie consent banner, global toast area, 404/500 pages.

---

## 6. PAGE SPECIFICATIONS

### 6.1 Homepage `/`
1. **Hero grid**: left large slide (about 2/3 width, 400px high): full-bleed image, small white eyebrow text ("Aerospace Industry"), large bold white headline, outlined white-bordered **Learn More** button with chevron. Slider with dots/arrows, autoplay pause on hover. Right column: two stacked teaser cards (light background, text left with eyebrow + bold title, product image right, outlined **Learn More** button). All admin-managed (`HOME_HERO`, `HOME_SIDE_TOP`, `HOME_SIDE_BOTTOM`).
2. **"Our assortment. *More than 500,000 products.***" heading (bold + muted grey), followed by **category tile grid** (4 columns desktop, 2 tablet, 1 mobile): grey tile `#F2F2F2`, category image left (~64px), label right. Links to category pages.
3. Two content teasers (image + eyebrow + H3 + text + link), "Our highlights" 3-card row, "Our brands" two-card row, full-width feature banner, SEO text block, quick-order widget (tabs: *Enter article number* | *Import CSV file* | *Fill out order form*), all from CMS blocks.
4. Statically generated with ISR (revalidate 10 min) + on-demand revalidation on admin changes.

### 6.2 Category page (non-leaf) `/…/c/[code]`
Layout from reference ("Drilling"): breadcrumb → **H1** → "**Categories**" subheading → **subcategory tile grid** (4 cols; image left, label with live product count, e.g. `Drills (632)`) → "**Filter & Sort**" block → product count, list/tile toggle and product results below.
- If the category has children, show the tile grid first; products listing (all products in subtree) below the filter bar.
- Counts computed from a materialized `productCount` field on `Category`, maintained by a job (not live COUNT on request).

### 6.3 Leaf category / listing page (e.g. "Centre drills")
- Breadcrumb, H1, **Filter & Sort bar**: a row of dropdown buttons (**Sorting**, then up to ~10 category-specific filter groups such as *Brand, Dimensions & Measurements, Workpiece & Machine Suitability, Material & Composition, Tool version, Type of drilling tool, Shank & Holder, Cutting Edge Geometry & Tool Angles, Machining group*) wrapping across lines, then an **All filters** button (icon + label) that opens a full-height filter drawer with a **search box inside filters** and all facets grouped. A dismissible orange-bordered popover appears once: "New: Search the filters now." (remember dismissal in localStorage).
- Below: left: **`25 products`** count; right: **In stock** checkbox toggle, **List / Tile** view toggle (persist in cookie).
- **List row** layout (3 vertical-divided columns):
  1. Image (left, with **Bestseller** badge above it), product name (bold), **brand badge** (navy), `Article no.: 111100`, **availability line** with coloured dot (e.g. amber "Available in 11-14 working days"; green "In stock"; red "Not available"), small grey chip `11 variants`.
  2. Price block, right-aligned: small "from", big bold **`INR 2,302.30`**, small text "plus VAT at the current rate" + underlined "Prices plus delivery costs" link (opens a modal with shipping info).
  3. Orange full-width button: **Go to variants** (with list icon) when product has >1 variant; **Add to shopping cart** with quantity stepper when it has a single variant.
- **Tile view**: card grid (image, name, brand, price from, availability, CTA).
- Active filters shown as removable chips with "Clear all". Filter state lives in URL query params (see SEO rules for canonicalisation). Pagination: numbered pagination (24/48/96 per page).
- Loading: skeleton rows; empty state: "No products match your filters" + reset.

### 6.4 Product detail page (PDP) `/…/p/[articleOrSlug]`
Matches reference:
- Breadcrumb (full category path, last item = product's category).
- **Left**: vertical thumbnail strip (photo, dimension drawing, technical drawing, more), large main image, "**Click to enlarge image**" with fullscreen zoom lightbox (keyboard + swipe).
- **Right column**: brand badge (navy), **H1** (product name incl. selected variant attribute, supports subscript like D<sub>C</sub> through a safe inline-markup formatter), `Article no.: 111100 0,5` (bold label), big **price** `INR 2,357.30`, muted "Price per 1 Piece", "plus VAT at the current rate" + "Prices plus delivery costs" link, and for guests a teal-bold line "**Individual prices for business customers after login.**" with underlined login link. For logged-in B2B users show their customer price (and list price struck through if different) plus **quantity price tiers** table if defined.
- **Variant selector**: label (e.g. "Nominal ⌀ D<sub>C</sub> k12 (mm):") followed by **square option buttons** (selected = orange fill with white text; each has a small availability dot: green/amber/red). Supports multiple variant axes (one selector row per axis; disable combinations that don't exist). Selecting a variant updates URL (`?variant=111100-0-5`), title, price, article number, images, tech data, and availability without full reload.
- Quantity stepper (respect `minOrderQty` and `packSize`) + **Add to shopping cart** button; "Do you want to order more than one article? **To quick entry**" orange link.
- **Tabs** (sticky on scroll, orange underline on active): **Product details | Description | Downloads & documents | Compare products**.
  - *Product details*: "**Technical Data**" two-column zebra table (grey/white rows), driven by attribute definitions, with units and subscript formatting.
  - *Description*: rich text (sanitised HTML) from product.
  - *Downloads & documents*: datasheets, CAD files, manuals (Cloudinary raw / URL), with file type icon and size.
  - *Compare products*: compare list (up to 4 products) stored client-side; table of attributes side by side.
- **Sticky bottom bar** after scrolling past the buy box: left: product title; right: price + VAT text + orange **Add to shopping cart** button + scroll-to-top button.
- Related/accessory products carousel, recently viewed (client-side).
- JSON-LD `Product` + `Offer` (price, currency INR, availability, sku, gtin13 when present, brand).

### 6.5 Search
- **Autocomplete** (debounced 200ms): groups: Products (image, name, article no.), Categories, Brands; recent searches; exact article-number match jumps to PDP.
- **Search results page** `/search?q=`: same layout as listing page, with category facet and filters; `noindex`.

### 6.6 Cart `/cart`
- Works for guests and logged-in users. Line items: image, name, article no., variant attributes, unit price (excl. tax), qty stepper (min/pack rules), line total, remove. Availability/lead-time per line. Order summary: subtotal, estimated tax (configurable rate, default 18% GST), shipping ("calculated at checkout"/free threshold from config), grand total. Buttons: **Continue shopping**, **Proceed to checkout**, **Save as list**(optional, logged-in only), CSV export of cart.
- **Guest → checkout**: clicking Proceed to checkout while unauthenticated redirects to `/login?redirect=/checkout` (with explanatory banner "Please sign in to continue to checkout"). After login/registration the guest cart is **merged** into the user's cart and the user lands on `/checkout`.
- Mini-cart panel from header (last items, subtotal, CTA).

### 6.7 Checkout `/checkout` (auth required, `noindex`)
Steps (single page, accordion or stepper): 1) Shipping address (select/add, GSTIN optional for business) → 2) Delivery method → 3) Payment (provider interface; default methods: **Pay on invoice / Request order (B2B)** and **Online payment via gateway** using a `PaymentProvider` abstraction with a Razorpay adapter behind a feature flag) → 4) Review (PO number, commission/notes field) → **Place order**. Server re-validates prices, stock, min-order rules and recomputes totals; creates `Order` + `OrderItem` snapshots in one DB transaction; clears cart; sends confirmation email; shows `/checkout/success/[orderNo]`.

### 6.8 Auth pages
- `/login`: tabs **Password** | **Email OTP**. Password: email + password. OTP: enter email → send code → enter 6-digit code (resend timer 60s, attempts counter). Link: Forgot password, Create account.
- `/register`: B2B (company name, GSTIN optional, contact name, email, phone, password) and B2C variants; **email verification via OTP is mandatory** before the account is activated.
- `/forgot-password` → OTP-verified reset flow.
- Redirect handling (`?redirect=`) must be validated against an allow-list of internal paths (prevent open redirect).

### 6.9 Account area (auth required, `noindex`)
`/my-account` (overview), `/my-account/profile`, `/my-account/addresses`, `/my-account/security` (change password, active sessions, logout all), `/my-company` (company users for B2B admins, optional), `/my-company/orders` and order detail (status timeline, reorder button, invoice download placeholder), `/my-account/lists` (saved lists).

### 6.10 Quick order `/quick-order` (also the "Direct purchase" popover)
Tabs: **Enter article number** (rows: article number + variant + qty, live validation against API, add-row), **Import CSV file** (download template, drag-and-drop upload, per-row validation preview, add all valid rows to cart), **Fill out order form** (paste multiple lines `articleNo;qty`). 

### 6.11 CMS/content pages `/e/[slug]` (also brands, fields of application, services, guides, events)
Block-based pages (hero, rich text, image+text, card grid, product carousel by category/brand, accordion/FAQ, CTA banner, video embed). Rendered server-side from `CmsPage.blocks` JSON with a strict block registry (unknown block types are ignored and logged).

### 6.12 Brands `/brands` and `/brands/[slug]`: alphabetical brand index and brand page with listing.

### 6.13 Utility pages: Contact, Help/FAQ, Newsletter signup, 404, error boundary, maintenance mode.

---

## 7. ROUTING (Next.js App Router)

URL base is `/{country}/{lang}` (default `/in/en`); implement through a `[country]/[lang]` segment with a middleware that redirects `/` to `/in/en`. Configure only `in/en` active now, but keep the structure so adding countries needs config only (hreflang generated from `site.config.ts`).

| Route | Purpose | Rendering |
|---|---|---|
| `/{c}/{l}` | Home | SSG + ISR |
| `/{c}/{l}/[...slugPath]/c/[code]` | Category / listing. Slug path is cosmetic and canonical; `code` (e.g. `10-01-01-00-00`) is the lookup key; redirect 301 if slug path differs from canonical | SSR with `revalidate` + tag cache |
| `/{c}/{l}/p/[articleSlug]` | PDP (`[articleSlug]` = `{productSlug}-{firstArticleNo}`) | ISR (revalidate 1h) + on-demand tags, live price/stock fetched client-side |
| `/{c}/{l}/search` | Search | SSR, noindex |
| `/{c}/{l}/brands`, `/brands/[slug]` | Brands | ISR |
| `/{c}/{l}/e/[slug]` | CMS page | ISR |
| `/{c}/{l}/cart`, `/checkout`, `/checkout/success/[orderNo]`, `/quick-order` | Commerce | CSR/SSR, noindex |
| `/{c}/{l}/login`, `/register`, `/forgot-password` | Auth | SSR, noindex |
| `/{c}/{l}/my-account/*`, `/my-company/*` | Account | SSR (auth middleware), noindex |
| `/admin/*` | Admin (route group `(admin)`) | CSR with server auth guard (role ADMIN/STAFF), noindex |
| `/sitemap.xml`, `/sitemaps/[type]/[n].xml`, `/robots.txt` | SEO | Route handlers |
| `/api/revalidate` | Secured on-demand revalidation webhook | Route handler |

Use route groups `(shop)`, `(account)`, `(auth)`, `(admin)` with their own layouts. Auth is enforced in `middleware.ts` (reads the refresh/session cookie) **and** re-verified server-side in layouts/actions. Provide `loading.tsx`, `error.tsx`, `not-found.tsx` per group.

---

## 8. DATABASE (Prisma + PostgreSQL)

Implement this schema (adjust only for correctness; keep names). Use `Decimal(12,2)` for money, cuid IDs, `createdAt/updatedAt` everywhere, soft delete (`deletedAt`) on catalog entities.

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL"); directUrl = env("DIRECT_URL") }

enum Role { CUSTOMER STAFF ADMIN }
enum UserType { B2B B2C }
enum OtpPurpose { REGISTER LOGIN RESET_PASSWORD }
enum ProductStatus { DRAFT PUBLISHED ARCHIVED }
enum AttrType { STRING NUMBER BOOLEAN ENUM }
enum FilterWidget { CHECKBOX RANGE DROPDOWN }
enum ImageKind { PHOTO DRAWING TECHNICAL OTHER }
enum DocKind { DATASHEET CAD MANUAL CERTIFICATE OTHER }
enum OrderStatus { PENDING CONFIRMED PROCESSING SHIPPED DELIVERED CANCELLED }
enum PaymentStatus { UNPAID PAID FAILED REFUNDED }
enum ImportStatus { UPLOADED PARSING VALIDATING VALIDATED_WITH_ERRORS READY_TO_COMMIT COMMITTING COMPLETED FAILED ROLLED_BACK CANCELLED }
enum IssueSeverity { ERROR WARNING }
enum BannerPlacement { HOME_HERO HOME_SIDE_TOP HOME_SIDE_BOTTOM HOME_HIGHLIGHT MENU_TEASER }

model User {
  id String @id @default(cuid())
  email String @unique
  emailVerifiedAt DateTime?
  passwordHash String?
  role Role @default(CUSTOMER)
  type UserType @default(B2B)
  firstName String
  lastName String
  phone String?
  companyId String?
  company Company? @relation(fields: [companyId], references: [id])
  isActive Boolean @default(true)
  lastLoginAt DateTime?
  addresses Address[]
  carts Cart[]
  orders Order[]
  refreshTokens RefreshToken[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([companyId])
}

model Company {
  id String @id @default(cuid())
  name String
  gstin String?
  customerNumber String? @unique
  users User[]
  customerPrices CustomerPrice[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model OtpCode {
  id String @id @default(cuid())
  email String
  purpose OtpPurpose
  codeHash String
  attempts Int @default(0)
  expiresAt DateTime
  consumedAt DateTime?
  createdAt DateTime @default(now())
  @@index([email, purpose, createdAt])
}

model RefreshToken {
  id String @id @default(cuid())
  userId String
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String @unique
  familyId String
  userAgent String?
  ip String?
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime @default(now())
  @@index([userId]) @@index([familyId])
}

model Address {
  id String @id @default(cuid())
  userId String
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  label String?
  contactName String
  phone String
  line1 String
  line2 String?
  city String
  state String
  postalCode String
  country String @default("IN")
  gstin String?
  isDefaultShipping Boolean @default(false)
  isDefaultBilling Boolean @default(false)
}

model Category {
  id String @id @default(cuid())
  code String @unique            // e.g. "10-01-01-00-00"
  slug String
  name String
  description String?
  parentId String?
  parent Category? @relation("CategoryTree", fields: [parentId], references: [id])
  children Category[] @relation("CategoryTree")
  path String                    // materialized path of ids: "/idA/idB/idC/"
  pathSlugs String               // "machining/drilling/drills/centre-drills"
  level Int
  sortOrder Int @default(0)
  imagePublicId String?
  iconPublicId String?
  productCount Int @default(0)   // subtree count, maintained by job
  isActive Boolean @default(true)
  seoTitle String?
  seoDescription String?
  products Product[]
  attributes CategoryAttribute[]
  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([parentId, sortOrder]) @@index([path]) @@index([slug])
}

model Brand {
  id String @id @default(cuid())
  slug String @unique
  name String @unique
  logoPublicId String?
  badgeColor String?
  description String?
  isPremium Boolean @default(false)
  products Product[]
}

model AttributeDefinition {
  id String @id @default(cuid())
  key String @unique             // "tool_material", "cutter_diameter_min"
  label String
  labelHtml String?              // supports <sub>: "Cutter diameter, min. D<sub>c min.</sub>"
  groupName String               // "Dimensions & Measurements"
  type AttrType
  unit String?
  enumValues Json?               // allowed values for ENUM
  categories CategoryAttribute[]
  values ProductAttributeValue[]
}

model CategoryAttribute {
  categoryId String
  attributeId String
  category Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  attribute AttributeDefinition @relation(fields: [attributeId], references: [id], onDelete: Cascade)
  isRequired Boolean @default(false)
  isFilterable Boolean @default(true)
  isVariantAxis Boolean @default(false)
  filterWidget FilterWidget @default(CHECKBOX)
  sortOrder Int @default(0)
  @@id([categoryId, attributeId])
}

model Product {                  // product family
  id String @id @default(cuid())
  slug String @unique
  name String
  brandId String
  brand Brand @relation(fields: [brandId], references: [id])
  categoryId String
  category Category @relation(fields: [categoryId], references: [id])
  shortDescription String?
  descriptionHtml String?
  isBestseller Boolean @default(false)
  status ProductStatus @default(DRAFT)
  seoTitle String?
  seoDescription String?
  searchVector Unsupported("tsvector")?   // generated/maintained via SQL migration, GIN index
  variants Variant[]
  images ProductImage[]
  documents ProductDocument[]
  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([categoryId, status]) @@index([brandId]) @@index([status, isBestseller])
}

model Variant {
  id String @id @default(cuid())
  productId String
  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  articleNo String @unique       // "111100 0,5"
  ean String? @unique
  name String?
  listPrice Decimal @db.Decimal(12,2)
  currency String @default("INR")
  priceUnit Int @default(1)      // "Price per 1 Piece"
  unitLabel String @default("Piece")
  taxClass String @default("STANDARD")
  stockQty Int @default(0)
  leadTimeMinDays Int?
  leadTimeMaxDays Int?
  minOrderQty Int @default(1)
  packSize Int @default(1)
  isActive Boolean @default(true)
  attributes ProductAttributeValue[]
  priceTiers PriceTier[]
  customerPrices CustomerPrice[]
  cartItems CartItem[]
  images ProductImage[]
  sortOrder Int @default(0)
  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([productId, sortOrder]) @@index([listPrice])
}

model ProductAttributeValue {    // normalized for fast faceting
  id String @id @default(cuid())
  variantId String
  variant Variant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  attributeId String
  attribute AttributeDefinition @relation(fields: [attributeId], references: [id])
  valueString String?
  valueNumber Decimal? @db.Decimal(18,6)
  valueBool Boolean?
  @@unique([variantId, attributeId, valueString])
  @@index([attributeId, valueString]) @@index([attributeId, valueNumber]) @@index([variantId])
}

model PriceTier { id String @id @default(cuid()) variantId String variant Variant @relation(fields: [variantId], references: [id], onDelete: Cascade) minQty Int price Decimal @db.Decimal(12,2) @@unique([variantId, minQty]) }

model CustomerPrice {
  id String @id @default(cuid())
  companyId String
  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  variantId String
  variant Variant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  price Decimal @db.Decimal(12,2)
  validFrom DateTime?
  validTo DateTime?
  @@unique([companyId, variantId]) @@index([variantId])
}

model ProductImage {
  id String @id @default(cuid())
  productId String
  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  variantId String?
  variant Variant? @relation(fields: [variantId], references: [id], onDelete: SetNull)
  publicId String               // Cloudinary public_id
  kind ImageKind @default(PHOTO)
  alt String?
  sortOrder Int @default(0)
  @@index([productId, sortOrder])
}

model ProductDocument { id String @id @default(cuid()) productId String product Product @relation(fields: [productId], references: [id], onDelete: Cascade) kind DocKind title String url String publicId String? sizeBytes Int? @@index([productId]) }

model Cart {
  id String @id @default(cuid())
  userId String?
  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)
  anonymousToken String? @unique     // guest cart cookie value (hashed)
  currency String @default("INR")
  items CartItem[]
  expiresAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([userId])
}

model CartItem {
  id String @id @default(cuid())
  cartId String
  cart Cart @relation(fields: [cartId], references: [id], onDelete: Cascade)
  variantId String
  variant Variant @relation(fields: [variantId], references: [id])
  quantity Int
  note String?
  @@unique([cartId, variantId])
}

model Order {
  id String @id @default(cuid())
  orderNo String @unique
  userId String
  user User @relation(fields: [userId], references: [id])
  status OrderStatus @default(PENDING)
  paymentStatus PaymentStatus @default(UNPAID)
  paymentMethod String
  shippingAddress Json
  billingAddress Json
  poNumber String?
  notes String?
  subtotal Decimal @db.Decimal(12,2)
  taxTotal Decimal @db.Decimal(12,2)
  shippingTotal Decimal @db.Decimal(12,2)
  grandTotal Decimal @db.Decimal(12,2)
  currency String @default("INR")
  items OrderItem[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([userId, createdAt])
}

model OrderItem {
  id String @id @default(cuid())
  orderId String
  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
  variantId String?
  articleNo String
  name String
  attributesSnapshot Json?
  imagePublicId String?
  unitPrice Decimal @db.Decimal(12,2)
  quantity Int
  lineTotal Decimal @db.Decimal(12,2)
}

model Banner { id String @id @default(cuid()) placement BannerPlacement eyebrow String? heading String subheading String? ctaLabel String? ctaHref String? imagePublicId String sortOrder Int @default(0) isActive Boolean @default(true) startsAt DateTime? endsAt DateTime? }
model CmsPage { id String @id @default(cuid()) slug String @unique title String blocks Json seoTitle String? seoDescription String? status ProductStatus @default(DRAFT) updatedAt DateTime @updatedAt }

model ImportJob {
  id String @id @default(cuid())
  type String                       // "PRODUCTS"
  status ImportStatus @default(UPLOADED)
  fileName String
  filePublicId String?              // stored raw file (Cloudinary raw or local storage adapter)
  fileSha256 String
  mode String                       // "DRY_RUN" | "COMMIT"
  options Json?                     // e.g. { onDuplicate: "UPDATE" | "SKIP" | "FAIL" }
  stats Json?                       // { rows, created, updated, skipped, errors, warnings }
  createdById String
  startedAt DateTime?
  finishedAt DateTime?
  createdAt DateTime @default(now())
  issues ImportIssue[]
  @@index([createdById, createdAt])
}
model ImportIssue { id String @id @default(cuid()) jobId String job ImportJob @relation(fields: [jobId], references: [id], onDelete: Cascade) sheet String rowNumber Int column String? severity IssueSeverity code String message String rawValue String? @@index([jobId, severity]) }
model ImportBatchItem { id String @id @default(cuid()) jobId String entity String entityId String action String previous Json? @@index([jobId]) }   // enables rollback

model AuditLog { id String @id @default(cuid()) actorId String? action String entity String entityId String? diff Json? ip String? createdAt DateTime @default(now()) @@index([entity, entityId]) @@index([actorId, createdAt]) }
model SearchQueryLog { id String @id @default(cuid()) q String resultCount Int createdAt DateTime @default(now()) }
```

Also write raw-SQL migrations for: `pg_trgm` + `unaccent` extensions; generated `search_vector` on `Product` (name A, brand name + article numbers B, description C) with GIN index; GIN trigram indexes on `Variant.articleNo`, `Product.name`; partial indexes for `deletedAt IS NULL AND status='PUBLISHED'`. Seed script per Section 22.

---

## 9. BACKEND MODULES AND API

Base path `/api/v1`. Response envelope: `{ success, data, meta?, error? }`; errors use `{ code, message, details? }` with stable error codes. All input validated with zod from `packages/shared`. Pagination: `?page&pageSize` (max 100) with `meta.total`. Every endpoint documented in OpenAPI.

**Modules:** `auth`, `users`, `companies`, `addresses`, `catalog` (categories, navigation), `products`, `brands`, `attributes`, `search`, `pricing`, `cart`, `checkout`, `orders`, `quick-order`, `cms` (banners, pages), `media` (Cloudinary signing), `imports`, `admin-*` (thin controllers composing the above for admin), `seo` (sitemap data), `health`.

| Area | Endpoints (examples; implement all needed by the UI) |
|---|---|
| Auth | `POST /auth/register`, `/auth/verify-email`, `/auth/login/password`, `/auth/login/otp/request`, `/auth/login/otp/verify`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/password/forgot`, `/auth/password/reset`, `GET /auth/me` |
| Catalog | `GET /navigation/tree?depth=`, `GET /categories/:code`, `GET /categories/:code/children`, `GET /categories/:code/filters` |
| Listing | `GET /categories/:code/products?filters...&sort&inStock&page&pageSize` (returns items, facets with counts, total) |
| Product | `GET /products/:slug`, `GET /variants/:articleNo`, `GET /products/:slug/related` |
| Search | `GET /search?q=`, `GET /search/suggest?q=` |
| Pricing | `POST /pricing/resolve` (variant IDs + qty → effective prices for current user) |
| Cart | `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:id`, `DELETE /cart/items/:id`, `POST /cart/merge`, `POST /cart/import-csv` |
| Checkout/Orders | `POST /checkout/validate`, `POST /checkout/place-order`, `GET /orders`, `GET /orders/:orderNo` |
| Quick order | `POST /quick-order/validate` (lines → resolved variants + errors) |
| CMS | `GET /cms/home`, `GET /cms/pages/:slug`, `GET /banners?placement=` |
| Media | `POST /admin/media/sign-upload` |
| Admin | CRUD for products, variants, categories (+ `PATCH /admin/categories/reorder`, `/move`), brands, attributes, category-attribute mapping, banners, CMS pages, orders (status update), users/companies, customer prices, plus Import endpoints (Section 15) |
| SEO | `GET /seo/sitemap/:type/:page` |
| Health | `GET /health`, `/health/ready` |

**Cross-cutting backend requirements:** helmet, CORS allow-list, compression, rate limiting (stricter on auth/OTP), request-ID, pino-http, centralized error handler (maps Prisma/Zod/known errors), graceful shutdown, env validation at boot (fail fast), `authenticate`/`authorize(role)` middleware, idempotency key support on `place-order`, audit logging on all admin writes, DB transactions via a `withTransaction` helper.

---

## 10. AUTHENTICATION DETAILS

- **Methods:** (a) email + password, (b) passwordless email OTP login, (c) registration requires email OTP verification, (d) password reset via OTP.
- **OTP:** 6 digits, cryptographically random, stored as HMAC-SHA256 hash (server secret), TTL 10 min, max 5 attempts then invalidated, resend cooldown 60 s, max 5 sends/hour per email+IP, one active OTP per (email, purpose). Responses never reveal whether an email exists (generic message, constant-ish timing).
- **Passwords:** argon2id, min 10 chars with strength check, compare timing-safe, optional breached-password check hook.
- **Sessions:** short-lived access JWT (15 min, in memory on the client and also sent via `Authorization`), **rotating refresh token** (30 days) in `httpOnly; Secure; SameSite=Lax` cookie, stored hashed with `familyId`; reuse detection revokes the whole family. CSRF protection (double-submit token or SameSite + custom header) for cookie-authenticated mutations.
- **RBAC:** `CUSTOMER`, `STAFF` (catalog/content/orders), `ADMIN` (everything incl. users, imports rollback, settings). Next.js middleware + backend `authorize()`.
- Brute-force protection: progressive lockout per account and per IP, audit log of auth events.
- OTP/transactional email templates (HTML + text) in `apps/api/src/modules/mail/templates` with a preview script.

---

## 11. CART AND CHECKOUT LOGIC

- **Guest cart:** server-side cart created on first add; cart token stored in an `httpOnly` cookie (hashed in DB, 60-day expiry). **Logged-in cart:** tied to `userId`.
- **Merge on login:** `POST /cart/merge` is called automatically after successful auth: sum quantities for identical variants (respect max/pack rules), delete guest cart, return merged cart.
- All price/tax/total calculation happens **on the server** (`PricingService`) in this order: customer price (valid dates) → quantity tier → list price. Never trust client prices. Cart responses include a `warnings[]` array (price changed, qty adjusted to pack size, out of stock).
- Enforce `minOrderQty` and `packSize` multiples. Stock policy configurable (`ALLOW_BACKORDER`); lead time shown from variant fields.
- **Checkout is auth-gated** (see 6.6/6.7). `place-order` runs in one transaction: re-price, re-validate stock, create order with item snapshots, decrement stock (if configured), clear cart, enqueue confirmation email job, return order number (`ORD-YYYY-NNNNNN` from a sequence).
- Tax: configurable rate (default 18% GST) and shipping rules in a `settings` module; prices stored and displayed excluding tax with "plus VAT/GST at the current rate".

---

## 12. SEARCH AND FILTERING

- **Search:** PostgreSQL full-text (`tsvector`, weighted) + `pg_trgm` for typo tolerance, exact/prefix match on `articleNo` and `ean` ranked first. Wrap in a `SearchEngine` interface (`PostgresSearchEngine` now; `MeilisearchEngine` adapter possible later without touching callers).
- **Facets:** per category, the filter set comes from `CategoryAttribute` (`isFilterable`, `filterWidget`, `sortOrder`, grouped by `groupName`). Facet counts calculated by SQL aggregation over `ProductAttributeValue`, scoped to the category subtree (use `Category.path LIKE`) and current selected filters (disjunctive faceting: a facet doesn't filter itself). Numeric attributes support RANGE (min/max). Brand and "In stock" are always available.
- **Sorting:** relevance, price asc/desc, name, bestseller, newest.
- Use cursor-friendly queries, covering indexes, and a short TTL cache (in-memory LRU with a `CacheService` interface, Redis-ready) for facet metadata and navigation tree. Target: listing API p95 < 300 ms at 500k variants.
- URL contract for filters: `?brand=garant,holex&dc_min=0.5&dc_max=3&inStock=1&sort=price_asc&page=2`.

---

## 13. SEO REQUIREMENTS (mandatory)

1. **Rendering:** all catalog, CMS and brand pages are server-rendered (SSG/ISR/SSR) with full HTML content (no client-only product data). Cart/checkout/account/admin/search are `noindex`.
2. **Metadata:** `generateMetadata` on every page: title templates (`{name} | {category} | {brand name}`), meta description (admin override or auto-generated, 150–160 chars), canonical, Open Graph, Twitter cards, `robots`.
3. **Canonicalisation:** filtered/sorted listing URLs have `canonical` pointing to the unfiltered category URL and `noindex,follow` when any filter/sort is active; paginated pages self-canonical with `rel=prev/next` hints; variant URLs canonicalise to the product URL unless variants have distinct indexable value (configurable).
4. **Structured data (JSON-LD):** `Organization`, `WebSite` + `SearchAction`, `BreadcrumbList`, `ItemList` for listings, `Product` + `Offer` (price, `priceCurrency=INR`, availability, sku, gtin, brand, image) for PDP.
5. **Sitemaps:** sitemap index + chunked sitemaps (≤ 45,000 URLs each) per type (categories, products, brands, cms) with `lastmod`; `robots.txt` references them and disallows cart/checkout/account/admin/search/filter parameters.
6. **hreflang** alternates generated from active locales; clean human-readable URLs; 301 on slug changes using a `SlugRedirect` mechanism.
7. **Performance (Core Web Vitals):** LCP < 2.5 s, CLS < 0.1, INP < 200 ms. Use `next/image` with the Cloudinary loader, `priority` only for the first hero image, responsive `sizes`, font preloading with `display: swap`, route-level code splitting, no layout shift (reserve aspect ratios), minimal client JS (server components by default; client components only for interactivity).
8. **Semantics/accessibility:** one H1 per page, semantic landmarks, descriptive alt text (auto from product name + attribute if empty), accessible forms. Lighthouse SEO ≥ 95, Accessibility ≥ 90 on home/category/PDP.
9. **On-demand revalidation:** admin/import/CMS changes enqueue a `revalidate` job that calls `/api/revalidate` with tags (`product:{slug}`, `category:{code}`, `navigation`, `home`).

---

## 14. CLOUDINARY

- Folder convention: `catalog/products/{productId}/`, `catalog/categories/`, `cms/banners/`, `catalog/documents/`, `brands/`.
- **Admin uploads are signed**: frontend asks `POST /admin/media/sign-upload` (validates folder, resource type, size, allowed formats) and uploads directly to Cloudinary; the backend stores only `publicId`.
- Delivery: custom `next/image` loader building URLs with `f_auto,q_auto,c_fill|c_limit,w_{w}` and named presets (`thumb`, `tile`, `pdp_main`, `pdp_zoom`, `hero`, `banner`, `og`). Never store full URLs in the DB.
- Backend `MediaService`: upload-from-URL (used by import), delete-by-publicId (on hard delete / image removal via job), bulk upload with concurrency limit (5) and retry with backoff; checks mime/size; sets `alt` metadata.

---

## 15. ADMIN PANEL (`/admin`)

A clean, responsive admin UI (sidebar layout, DataTable with server-side pagination/sort/filter/search, URL-synced state, bulk actions, optimistic updates with rollback, confirmation modals, toasts, form validation with field-level errors, unsaved-changes guard). Roles: STAFF and ADMIN.

**Sections:**
1. **Dashboard:** KPIs (products, variants, orders last 30 days, revenue, pending orders, failed imports), latest orders, low-stock list.
2. **Products:** list (search by name/article/EAN, filter by category/brand/status/stock), create/edit form with tabs: *General* (name, slug auto/override, brand, category picker with tree search, status, bestseller flag, short + rich description), *Variants* (inline editable grid: article no., EAN, price, stock, lead time, min qty, pack size, attribute values per category definitions, active toggle, add/duplicate/delete rows, bulk edit), *Images* (drag-and-drop multi-upload to Cloudinary, reorder, set kind/alt, assign to variant), *Documents*, *Attributes* (dynamic form generated from the category's attribute definitions with type-correct inputs and unit labels), *Pricing* (tiers + customer-specific prices), *SEO* (title, description, preview). Duplicate product, archive/restore (soft delete), bulk publish/unpublish/delete/move category.
3. **Categories:** drag-and-drop tree manager (reorder, move, create, edit, deactivate), images/icons, SEO fields, attribute mapping per category (which attributes, filterable, widget, variant axis, order) with inheritance from parent as default.
4. **Brands**, **Attributes** (definitions CRUD with type/unit/enum values).
5. **Content:** banners (placement, schedule, image, CTA, ordering) and CMS pages (block editor with the block registry and live preview).
6. **Orders:** list with filters, detail with status transitions (validated state machine), notes, resend email, export CSV.
7. **Customers/Companies:** list, edit, activate/deactivate, assign company, customer-specific price lists import (CSV).
8. **Import Center** (Section 16).
9. **Settings:** tax rate, shipping rules, stock policy, email templates preview, feature flags.
10. **Audit log** viewer.

---

## 16. EXCEL / CSV BULK IMPORT AUTOMATION (critical, very strict validation)

### 16.1 User flow (Admin → Import Center)
1. **Download template**: server generates an `.xlsx` template (optionally pre-filled with category-specific attribute columns for a chosen category) with a *README* sheet (instructions, rules, enumerations), data-validation dropdowns, header comments and an example row.
2. **Upload** `.xlsx`/`.csv` (max 25 MB, max 50,000 variant rows). Choose options: *on duplicate article no.* = `UPDATE` | `SKIP` | `FAIL`; *create missing brands* = yes/no; *publish status* = `DRAFT`|`PUBLISHED`; *image handling* = URL column and/or ZIP.
3. **Dry run (always first)**: the job parses and validates everything **without writing catalog data**; the UI shows progress, then a **validation report**: totals, error/warning counts grouped by code, filterable issue table (sheet/row/column/message/value), and **downloadable error report .xlsx** (original rows with an added "Errors" column) so the admin can fix and re-upload.
4. If there are zero errors (warnings allowed) the admin clicks **Commit import**. Commit runs in the background in batches (e.g. 500 rows/transaction), with live progress via polling or SSE.
5. **Result summary**: created/updated/skipped counts, link to affected products, and **Rollback** button (restores `ImportBatchItem.previous` states; ADMIN only; allowed only on the latest unmodified import or with a clear warning).

### 16.2 Workbook structure (sheets)
- **Products** (one row per product family): `product_key` (unique within file, required), `name`*, `brand`*, `category_code`*, `short_description`, `description_html`, `is_bestseller`, `status`, `seo_title`, `seo_description`.
- **Variants** (one row per article): `product_key`* (must exist in Products sheet or DB), `article_no`*, `ean`, `list_price`*, `currency`, `price_unit`, `unit_label`, `stock_qty`, `lead_time_min_days`, `lead_time_max_days`, `min_order_qty`, `pack_size`, `is_active`, plus **dynamic attribute columns** `attr:<attribute_key>` (e.g. `attr:cutter_diameter`, `attr:tool_material`).
- **Images**: `article_no` or `product_key`, `image_url` (https) or `zip_filename`, `kind`, `alt`, `sort_order`.
- **Documents**: `product_key`, `kind`, `title`, `url`.
- **PriceTiers** (optional): `article_no`, `min_qty`, `price`.
- **CustomerPrices** (optional): `customer_number`, `article_no`, `price`, `valid_from`, `valid_to`.
CSV import accepts a single Variants-style flat file (one product per `product_key` group) with the same columns.

### 16.3 Validation layers (all must be implemented, each issue has a stable `code`)
1. **File-level:** extension + magic-byte sniffing, size limit, not password-protected, no macros (`.xlsm` rejected), no formulas evaluated (read cached value only; flag formulas as warning), required sheets and headers present (case/space-insensitive aliases), no duplicate or unknown required columns, encoding for CSV (UTF-8/UTF-8-BOM), row limit.
2. **Cell/row schema (zod per sheet):** required fields; trimmed strings; max lengths; `article_no` regex and normalisation; `ean` GTIN-8/12/13/14 with **checksum validation**; `list_price` positive decimal ≤ 2 dp (accept Indian/EU separators only if unambiguous, otherwise error); integers non-negative; booleans (`true/false/yes/no/1/0`); URLs must be https and allow-listed domains/extensions for images; enums case-insensitive mapped; HTML sanitised (allow-list) with warning when stripped.
3. **Referential validation:** `category_code` exists, active and is a **leaf** category (configurable); `brand` exists (or creation allowed); `product_key` exists; attribute columns map to attributes **assigned to that category**; ENUM values within allowed list; NUMBER attributes numeric with consistent unit; required category attributes present; variant-axis attributes present and **combination unique within a product**.
4. **Uniqueness & duplicates:** duplicate `article_no`/`ean` inside the file (report all rows involved), conflicts with existing DB records owned by a *different* product (error), per duplicate policy for same-product updates; slug collisions auto-resolved with suffix and reported as warning.
5. **Business rules:** `lead_time_min <= lead_time_max`; `min_order_qty` multiple of `pack_size`; tier quantities strictly increasing with decreasing/equal price; customer price ≤ list price (warning otherwise); `valid_from <= valid_to`; images count limits; each published product has ≥ 1 variant and ≥ 1 image (warning for missing images).
6. **Safety:** per-job transaction batches; idempotent re-runs (same file SHA-256 + options warns "already imported"); concurrency lock per `ImportJob` type (only one COMMIT at a time); memory-safe **streaming** parsing; cancel support; timeouts; retries for image fetches; error isolation (a failing image fetch is a warning, not a failed import, unless `strictImages` option is on).

### 16.4 Implementation notes
- Code lives in `apps/api/src/modules/imports/` with sub-folders: `parsers/` (xlsx, csv), `schemas/`, `validators/` (one file per layer), `committers/` (products, variants, images, documents, tiers, customer-prices), `reports/` (issues → xlsx), `templates/` (template generator), `jobs/` (pg-boss handlers), `README.md` documenting every column and error code.
- Pipeline as composable steps: `parse → normalize → validateSchema → validateRefs → validateBusiness → plan (diff: create/update/skip) → commit(batch) → postProcess (refresh product counts, search vector, revalidate tags, Cloudinary image uploads queue)`.
- The **plan** step produces a per-row action list stored in the job so commit is deterministic and the preview can show "will create 120, update 40, skip 3".
- Provide fixtures: `valid.xlsx`, `invalid-*.xlsx` (one per error class), and Vitest suites covering every error code.

---

## 17. PERFORMANCE AND SCALABILITY

- Stateless API (12-factor), horizontal scalability, all config via env.
- Index every FK and query predicate; avoid N+1 (use `select`/`include` deliberately, DataLoader-style batching in repositories); pagination everywhere; never `SELECT *` into list endpoints; use read-optimised list DTOs.
- Caching layers: Next.js data cache + tags, HTTP cache headers (`s-maxage`, `stale-while-revalidate`) on public GETs, in-process LRU `CacheService` (Redis implementation optional via env).
- Materialized/maintained aggregates: `Category.productCount`, price-from per product (denormalised `minPrice` refreshed on variant change), availability summary.
- Background jobs for heavy work (imports, counts, emails, revalidation, image cleanup).
- Connection pooling (pgBouncer-compatible Prisma config), query timeouts, slow-query logging.
- Prepare for CDN in front of Next.js; images only via Cloudinary CDN.

---

## 18. SECURITY (OWASP-aligned)

Input validation everywhere (zod), output encoding, HTML sanitisation (DOMPurify/`sanitize-html` allow-list) for descriptions/CMS, parameterised queries only, secure cookies, CSRF, strict CORS, helmet + CSP (Cloudinary, fonts allowed), rate limiting, secrets only in env (never committed), signed Cloudinary uploads, file-upload hardening (type sniffing, size limits, storing outside web root), SSRF protection on any server-side URL fetch (https only, block private IP ranges, size/time limits), open-redirect protection, authorisation checks on every resource (IDOR safe: orders/addresses scoped by `userId`), audit logs, dependency audit in CI, no PII in logs.

---

## 19. DEVOPS (not a priority right now — keep minimal)

No Docker, no docker-compose, no CI/CD pipeline required for this build. Just make local dev trivial:
- `backend/.env.example` and `frontend/.env.local.example` with every variable documented (DB URL, JWT secrets, Cloudinary keys, SMTP, API base URL, etc.).
- Local dev assumes a plain local or hosted Postgres instance (e.g. Supabase) reachable via `DATABASE_URL`; no containerized Postgres required.
- Root `README.md` has a "Running locally" section: install Postgres connection string → `cd backend && npm install && npm run db:migrate && npm run db:seed && npm run dev` → `cd frontend && npm install && npm run dev`.
- Deployment is out of scope for the initial build; when it becomes relevant later, the frontend (Next.js) can go on Vercel and the backend (Express) on any Node host, with Postgres hosted separately — note this in `docs/deployment.md` as a short "future work" stub only, don't build pipelines for it now.

---

## 20. DOCUMENTATION REQUIREMENTS (must be delivered)

- Root `README.md`: overview, architecture diagram (Mermaid), quick start (< 10 commands), scripts, env vars, folder map.
- `docs/architecture.md` (layers, module boundaries, data flow, caching, jobs), `docs/database.md` (ERD in Mermaid + table purposes + index rationale), `docs/api.md` (conventions + link to Swagger), `docs/import.md` (columns, rules, every error code, examples), `docs/seo.md`, `docs/deployment.md`, `docs/contributing.md` (naming, branching, commit rules, how to add a module/page/block), `docs/adr/NNNN-*.md` for each significant decision.
- Every module folder has its own `README.md` (purpose, public API, key flows, gotchas).
- TSDoc on all exported functions/classes/types; inline comments explain *why*, not *what*.
- Code conventions enforced by ESLint/Prettier: kebab-case files, PascalCase components, named exports, absolute imports with aliases (`@/features/...`), barrel `index.ts` per feature exposing only the public surface, no circular dependencies (`eslint-plugin-import` / `madge` check in CI).

---

## 21. TESTING

- **Unit:** pricing engine, OTP service, cart merge, import validators (every error code), slug/path utilities, SEO helpers.
- **API integration (Supertest + test DB):** auth flows (password, OTP, refresh rotation/reuse), catalog and filtering, cart (guest → login merge), checkout/place-order (transaction, price re-validation), admin CRUD authorisation, import dry-run + commit + rollback.
- **E2E (Playwright):** home → category drill-down → PDP variant switch → add to cart as guest → checkout redirect to login → OTP login → place order; admin creates product with images; admin imports a valid and an invalid Excel file.
- Coverage targets: services ≥ 80%, import module ≥ 90%.
- Lighthouse CI check for home, category, PDP.

---

## 22. SEED DATA

Seed script (`pnpm db:seed`) creating:
- 8 top-level categories (Machining; Clamping technology; Measurement technology; Grinding & cutting technology; Hand tools; Workstations, storage and factory equipment; Power tools and pneumatic tools; Chemical-technical products), each with category codes in the pattern `NN-00-00-00-00`.
- Full sub-tree for **Machining**: Drilling, Thread machining, Turning, Milling, Sawing, Machining reference books & ancillaries, Machining services, Extended product range for machining. Under **Drilling**: Drills, Boring tools, Countersink tools & deburring tools, Reaming tools, Boring arbors & adapter solutions, Taps, Fluteless taps, Precision boring technology spare parts & accessories, Empty boxes & cartridges for precision boring. Under **Drills**: Centre drills, NC spotting drills, Jobber drills, Taper drills, Stepped drills, Core drills for reamers, Deep hole drills, Microdrills, Taper sheet and tube drills, Core drills, Hole saws & circle cutters, Concrete drills & masonry drills, Wood drills, Flow drills. Add partial sub-trees for the other 7 top-level categories (at least 2 levels).
- Attribute definitions for drills (tool material, coating, type of drilling tool, cutter diameter min/nominal, tolerance class ISO, centre drill shape, countersink angle, shaft diameter, overall length, max workpiece diameter, holder tolerance class, standard, etc.) mapped to the "Centre drills" category with filter widgets.
- Brands: a premium brand, a quality brand, 8 other brands (generic placeholder names).
- ≥ 200 products with variants; include the **"Centre drill HSS-E A TiAlN"** family with 11 variants (nominal diameter 0.5, 0.75, 1, 1.6, 1.5, 2, 2.5, 3, 3.15, 4, 5 mm; example article numbers `111100 0,5` … `111100 5`; list price from INR 2,302.30; first variant INR 2,357.30; mixed availability: some in stock, one with lead time 11–14 working days; tolerance k12, shaft diameter 3.15 mm, overall length 25 mm, DIN 333), flagged Bestseller.
- Placeholder images generated/uploaded to Cloudinary (or a local mock adapter when no Cloudinary env is set).
- Admin user (`admin@example.com`, password from env), a B2B customer with a company and some customer-specific prices, banners (3 hero + 2 side), a few CMS pages, and a valid sample import workbook in `apps/api/prisma/seed/sample-import.xlsx`.

---

## 23. NON-FUNCTIONAL ACCEPTANCE CRITERIA

- `pnpm i && pnpm dev` runs web, api, db and mail catcher locally with seeded data.
- No TypeScript errors, no ESLint errors, no circular deps, all tests green.
- Public pages render meaningful HTML with JS disabled (verify with `curl`): title, H1, breadcrumbs, product list, JSON-LD.
- Mobile-first responsive down to 360 px; keyboard navigable; no console errors.
- Every user-visible async action has loading, error and empty states.
- No secrets in the repo; all env documented.

---

## 24. BUILD PHASES (stop and report after each)

1. **Foundation:** monorepo, tooling, shared package, env validation, Docker compose, Prisma schema + migrations + SQL extensions, API skeleton (config, logger, errors, health, OpenAPI), Next.js skeleton with design tokens, fonts, base UI primitives, brand config.
2. **Auth & users:** register/verify OTP, password + OTP login, refresh rotation, RBAC, mail module, auth pages, account basics, middleware guards. Tests.
3. **Catalog core:** categories, brands, attributes, products/variants, media (Cloudinary) services + admin APIs; navigation tree endpoint; seed script (categories + sample products).
4. **Storefront browsing:** layout (header, drawer, footer), homepage + CMS banners, category pages (tiles, filters, listing list/tile views), PDP (gallery, variants, tabs, sticky bar), breadcrumbs, SEO metadata/JSON-LD, sitemaps, robots.
5. **Search & filtering:** FTS + trigram, autocomplete, facets, URL filter state, caching, performance indexes.
6. **Cart & checkout:** guest cart, merge, pricing engine (customer prices, tiers), mini-cart, cart page, quick order, checkout (auth-gated), orders, emails, account order history.
7. **Admin panel:** dashboard, products/variants/images CRUD, category tree manager, attributes mapping, brands, banners/CMS, orders, customers, audit log.
8. **Import automation:** template generator, parsers, all validation layers, dry-run report + error xlsx, commit batches, rollback, Import Center UI, fixtures and tests.
9. **Hardening:** security review, performance tuning (Lighthouse/CWV), accessibility pass, e2e suite, load sanity test, documentation completion, final README. (No CI/CD or containerization work in this phase — see Section 19.)

Begin now with the plan output, then Phase 1.
