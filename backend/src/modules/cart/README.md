# cart

Server-side cart for guests and signed-in users (spec Section 11).

## Purpose

- **Guest carts** live in the `Cart` table keyed by the HMAC-SHA256 hash of the
  `th_cart` httpOnly cookie token (60-day TTL, extended on every write).
- **User carts** are keyed by `userId` (one active cart; merge prevents strays).
- **All pricing is server-side**: the pricing module's ladder (customer price →
  quantity tier → list) runs on every read; client prices are never trusted.
- **Quantity rules** (`minOrderQty`, `packSize` multiples, stock policy) adjust
  quantities and report the adjustment as a `warnings[]` entry; only
  `STOCK_ONLY` + zero stock rejects a line with `OUT_OF_STOCK`.

## Public API (mounted at the API root)

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /cart` | optional bearer / guest cookie | Current cart (never creates a row) |
| `POST /cart/items` | optional | Add / increase a line; first guest add sets the cookie |
| `PATCH /cart/items/:id` | optional | Change quantity / note |
| `DELETE /cart/items/:id` | optional | Remove a line |
| `POST /cart/merge` | **required** | Guest cart → user cart after login |
| `POST /cart/import-csv` | optional | Add quick-order lines (articleNo + qty) |

## Key flows

- **Add**: load buyable variant (published product, active variant) → sum with
  an existing line → `applyQuantityRules` → upsert → touch expiry.
- **Merge** (login): one transaction — sum per-variant quantities across both
  carts, re-apply rules per line, delete the guest cart, clear the cookie. A
  line the rules reject is skipped with a warning, never a failed merge.
- **import-csv**: `articleNoCandidates` expands user input ("111100 0.5" ↔
  "111100 0,5"), invalid lines are reported per row, valid lines commit atomically.

## Gotchas

- **CSRF**: guest mutations are cookie-authenticated but skip the double-submit
  guard — every handler only accepts `application/json` bodies, which cross-site
  forms cannot produce, and cross-site `fetch` with a JSON content type hits the
  CORS allow-list preflight. Bearer-authenticated calls skip CSRF by design.
- Warnings are **not persisted**: adjustment warnings belong to the mutating
  response; stock warnings are re-derived on every read.
- Non-buyable rows (draft/archived product) are filtered from the DTO with an
  `ITEM_UNAVAILABLE` warning; checkout re-validates and rejects them.

## Testing

`__tests__/cart.test.ts` covers rules (pure) + API integration (guest add →
login merge → checkout hand-off) against the test DB.
