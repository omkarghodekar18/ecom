# quick-order

Quick order page (spec 6.10): three tabs for B2B bulk entry —
1) article-number rows with live validation,
2) CSV import with per-row preview,
3) pasted `articleNo;qty` lines.

**Public surface:** `QuickOrderView` (mounted by
`app/[country]/[lang]/(shop)/quick-order/page.tsx`).

**Key flows**

- Validation: `POST /quick-order/validate` (public endpoint) resolves each
  line by article no./EAN/name and returns per-line results (matched variant,
  resolved price, availability, error code) — debounced while typing.
- Adding: valid lines go to the cart via `cartApi.importCsv`-style adds;
  the cart cache updates and the user can jump to the cart/checkout.

**Gotchas**

- Works for guests (cart cookie) and signed-in users (bearer via the cart
  feature's `authFetch` wrappers) alike.
- The route is `noindex`; it is reachable from the PDP ("To quick entry")
  and the header "Direct purchase" button.
- Keep the CSV template download in sync with the backend importer columns
  (see `docs/import.md`).
