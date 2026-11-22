# checkout

Server-side checkout (spec 6.7/11) — auth-gated by design.

## Purpose

- **validate**: pre-flight (cart non-empty, buyable items, stock policy,
  delivery method) + totals preview. Used by the UI steps.
- **place-order**: one transaction — re-price (customer price → tier → list),
  re-validate stock/min-order, create `Order` + snapshot `OrderItem`s + the
  first `OrderEvent`, decrement stock, clear the cart. The confirmation email
  is enqueued (`order.confirmation` queue) after the commit.
- **payments/razorpay/verify**: checkout callback — HMAC signature + receipt
  binding, then `paymentStatus = PAID` + timeline event.

## Payment providers

`PaymentProvider` abstraction (payment.provider.ts):
- `INVOICE` — pay on invoice (B2B default), offline.
- `REQUEST` — order-as-request, offline.
- `RAZORPAY` — creates a gateway order via the REST API; only selectable while
  `features.razorpayCheckout` is on AND credentials are configured. A gateway
  failure after the local commit is recorded as an OrderEvent, never a lost order.

## Order numbers

`ORD-YYYY-NNNNNN` from the per-year `OrderSequence` counter, allocated with an
atomic increment inside the placement transaction.

## Idempotency

`PlaceOrderInput.idempotencyKey` (unique on `Order`): replays return the
original order; a key collision from another user is a 409.

## Gotchas

- The authoritative validation pass re-runs **inside** the transaction — the
  plan built before is only a preview.
- Under `ALLOW_BACKORDER`, stock decrements may go negative — the negative
  value is the open backorder. Under `STOCK_ONLY`, exceeding lines reject the
  placement with per-line issues.
- The email job loads the order fresh at send time; mail failures never roll
  the order back (pg-boss retries).

## Testing

`__tests__/checkout.test.ts` — place-order transaction (price re-validation,
stock decrement, cart clear, order number shape), idempotency replay, validate,
orders list/detail/reorder, razorpay signature verification.
