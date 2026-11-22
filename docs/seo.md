# SEO implementation (spec Section 13)

How the storefront meets the mandatory SEO requirements. Verification:
Lighthouse (Phase 9) — SEO **100/100/100** on home, category and PDP;
Accessibility **95/94/94**; unthrottled Lighthouse performance **100** on all
three (LCP 0.3–0.7 s, CLS ≤ 0.001, TBT ≤ 50 ms).

## 1. Rendering strategy

| Area | Rendering | Indexable |
| --- | --- | --- |
| Home, category, brand, CMS, PDP | SSG/ISR (`revalidate` per route, tag-based revalidation) | yes |
| Search, cart, checkout, account, admin | CSR/SSR | `noindex` (metadata or admin layout `robots: noindex,nofollow`) |

Product/category pages are server components — the full catalogue content is in
the HTML; no client-only product data.

## 2. Metadata

Every route implements `generateMetadata`:

- Title templates (`{name} | {category} | ToolHub India`, brand appended on PDP).
- Meta description: admin override (`seoDescription`) or auto-generated,
  trimmed to the 150–160 char window (`features/product/seo.ts`).
- Canonical, Open Graph and Twitter card tags via Next metadata.
- `robots`: `noindex,follow` on filtered/sorted listing URLs (see below);
  `noindex` on cart/checkout/account/search/admin.

## 3. Canonicalisation

- Filtered/sorted category URLs (`?brand=…&sort=…`) carry
  `canonical → unfiltered category URL` **and** `noindex,follow` while any
  filter/sort is active (`parseFilterParams` → `buildCategoryMetadata`).
- Paginated listings self-canonical; `rel=prev/next` hints are emitted.
- Variant URLs (`/p/{slug}/{articleNo}`) canonicalise to the product URL —
  variants don't carry distinct indexable value (configurable by extending
  `product()` route args in `config/routes.ts`).
- Slug changes produce 301s through the `SlugRedirect` table (category + PDP
  catch-all handlers look the old path up before rendering 404).

## 4. Structured data (JSON-LD)

`components/seo/json-ld.tsx` renders: `Organization` + `WebSite` +
`SearchAction` (layout), `BreadcrumbList` (breadcrumbs component), `ItemList`
for listings, and `Product` + `Offer` on the PDP — price, `priceCurrency=INR`,
availability, `sku` (article no.), `gtin` (EAN), brand, image.

## 5. Sitemaps and robots

`app/sitemap.xml/route.ts` + `app/*/sitemap/[slug]/route.ts`: sitemap index →
chunked sitemaps per type (categories, products, brands, CMS) with `lastmod`
from `updatedAt`. `robots.txt` references the index and disallows
cart/checkout/account/admin/search plus filter parameters.

## 6. Core Web Vitals

- `next/image` everywhere (local adapter or Cloudinary loader with
  `f_auto,q_auto` presets); `priority` only on the first hero slide and the
  first PDP gallery image; explicit `sizes` on every image.
- Fonts: Roboto with `display: swap` + preload (brand config).
- Server components by default; client islands limited to interactive pieces
  (variant selector, cart controls, sliders, admin).
- Fixed aspect ratios on media containers — measured CLS ≈ 0.

## 7. Semantics and accessibility

One `<h1>` per page, landmark structure (banner/main/contentinfo/navigation),
skip link, descriptive alt text (auto-derived "product name — attribute" when
the admin leaves alt empty), labelled form controls, focus-visible styles.
Descriptive link text: CMS "Learn more" fallbacks append a visually hidden
` about {heading}` suffix (WCAG 2.4.4 / Lighthouse `link-text`).

## 8. On-demand revalidation

Admin mutations and import commits enqueue a `revalidate` job → the backend
POSTs `FRONTEND_INTERNAL_URL/api/revalidate` with `REVALIDATE_SECRET` and
tags (`product:{slug}`, `category:{code}`, `navigation`, `home`); the route
handler calls `revalidateTag` (ADR 0010). ISR stale windows are the fallback.
