# product-detail

PDP composition (spec 6.4): gallery, buy box, variant selector, tabs
(technical data / compare / downloads / similar), sticky bar and
recently-viewed.

**Public surface:** `ProductDetailClient` (page body), `BuyBox`,
`VariantSelector`, `PricePanel`, `Gallery`, `ProductTabs`, `TechDataTable`,
`CompareTab`, `DownloadsTab`, `RecentlyViewed`, `RelatedCarousel`,
`StickyBar`, `useResolvedPrice`, `variant-utils`, `api.ts`.

**Key flows**

- Variant switch: selecting axis values resolves the matching variant,
  refetches the resolved price (`useResolvedPrice` → pricing endpoint with
  quantity) and re-renders technical data; the URL stays canonical (article
  no. only decorates links in).
- Add to cart: `AddToCartButton` posts quantity (minOrderQty/packSize rules
  enforced by the stepper) and toasts the result.
- Compare: selected variants are kept in a local-storage store and rendered
  as a unified attribute table.

**Gotchas**

- The price-from variant is the default selection — tests assert on it.
- `label-html.tsx` renders the backend's sanitised attribute labels (a tiny
  allow-list parser, not raw HTML).
- Recently-viewed is deduped, capped and hydrates from localStorage — do not
  push on every render (see the guard in `recently-viewed.tsx`).
