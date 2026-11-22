# quick-order

Article-number quick entry (spec 6.10) — the engine behind the
"Direct purchase" popover and `/quick-order` page tabs.

## Purpose

- `POST /quick-order/validate` resolves `{ articleNo, quantity }` lines against
  the live catalog: variant identity, product/brand name, image, list price,
  and the quantity rules (minOrderQty, packSize, stock policy — same code as
  the cart, imported from the cart module).
- Article numbers are expanded through `common/utils/article-no.util.ts`
  ("111100 0,5" ↔ "111100 0.5").
- Adding validated lines to the cart uses `POST /cart/import-csv` — this module
  never writes.

## Gotchas

- Resolution is public (guests can validate); only prices shown are list
  prices — customer prices apply once signed in (the cart resolves them).
- Unknown articles are per-line errors (`ARTICLE_NOT_FOUND`), never a failed
  request.

## Testing

`__tests__/quick-order.test.ts` — happy path, dot/comma article numbers,
unknown article, pack-size adjustment, STOCK_ONLY rejection.
