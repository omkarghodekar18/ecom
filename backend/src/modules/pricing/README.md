# pricing module

Effective unit prices for variant lines — the spec 15.x price ladder used by
the PDP, the cart and the checkout preview. One endpoint, one rule:

> valid **customer price** of the caller's company → else the **tier** with
> the highest `minQty ≤ quantity` → else the **list** price.

**Public API** (`index.ts`): `pricingRouter` (mount at the API root),
`pricingService` (`resolveForUser`), the pure `resolveUnitPrice` +
`ResolvePricesInputSchema` (+ `PriceLine` / `PriceSource` types),
`pricingRepository`.

**Mounting:** the router owns its whole sub-path space, so mount it at the API
prefix itself — `app.use(API_PREFIX, pricingRouter)`.

## Endpoints (all under `/api/v1`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/pricing/resolve` | optional | body `{ lines: [{ variantId, quantity }] }` (1–100 lines, integer quantities 1–100 000) → `ResolvedPriceDto[]` (one entry per line, order preserved, prices as 2dp strings, `basis` ∈ customer/tier/list) |

## Behaviour

- **Optional auth** — no bearer → guest → list/tier prices only. A
  presented-but-invalid/expired bearer still fails **401** with the same
  stable codes as `authenticate` (`TOKEN_INVALID` / `TOKEN_EXPIRED`):
  silently downgrading a signed-in customer to list prices would misprice
  their cart. No optional-auth middleware exists yet, so the controller
  verifies the bearer itself.
- **Visibility** — only PUBLISHED, non-deleted products with active,
  non-deleted variants are resolvable; anything else → 404 with the offending
  `variantIds` in `details`.
- **Customer prices** — `(companyId, variantId)` is unique; a row counts only
  when `now` is inside `[validFrom, validTo]` (NULL bounds open-ended).
- **`resolveUnitPrice` is pure** — no I/O, exported for reuse (cart/checkout
  will need the same ladder server-side); `resolveForUser` is the
  request-facing loader.

## Gotchas

- Duplicate lines are answered per line (same variantId twice with different
  quantities can yield two different unit prices) — callers dedupe if they
  want one row per variant.
- Money is rounded to 2 decimals at the boundary via `Decimal.toFixed(2)`
  (DB columns are already `Decimal(12,2)`; strings only ever lose trailing
  zeros).
