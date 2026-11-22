# orders

Customer-facing order history (spec 6.9).

## Purpose

- List + detail of **the caller's** orders with item snapshots and the status
  timeline (`OrderEvent` rows — one per transition, starting with the placement).
- **Reorder**: all lines of a past order go back into the cart through the cart
  module's import flow (current prices, current quantity rules).

## Public API (mounted at the API root)

| Route | Purpose |
| --- | --- |
| `GET /orders?page&pageSize` | Order list, newest first |
| `GET /orders/:orderNo` | Detail with items + timeline |
| `POST /orders/:orderNo/reorder` | Lines back into the cart |

## Gotchas

- Every read is **userId-scoped** — a foreign orderNo is a 404 `ORDER_NOT_FOUND`,
  never a 403 (no existence leak).
- Order items are **snapshots** (name, articleNo, attributes, unit price at
  purchase time); they never change when the catalog changes.
- Admin order management (status transitions, resend email) lives in the admin
  surface and reuses this module's repository.

## Testing

Covered by `../checkout/__tests__/checkout.test.ts` (place-order → list →
detail → reorder round-trip against the test DB).
