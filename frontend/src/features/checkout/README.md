# checkout

Single-page checkout stepper (spec 6.7): shipping address → delivery method →
payment → review → place order. Auth-gated (`/in/en/checkout` is in the
proxy's protected prefixes).

**Public surface:** `CheckoutView` (mounted by the checkout page),
`checkoutApi` (validate/place-order).

**Key flows**

- Address: pick a saved address radio or "Deliver to a new address"
  (inline form, GSTIN optional) — the new address is created on place-order.
- Payment: `INVOICE` (B2B standard) or `REQUEST` (no charge yet); Razorpay
  appears only when the settings flag enables it.
- Place order: `POST /checkout/place-order` re-validates prices/stock/quanties
  server-side, creates the order snapshot in one transaction, clears the cart
  and queues the confirmation email; the browser lands on
  `/checkout/success/[orderNo]`.

**Gotchas**

- The route is `noindex`; server components forward nothing — the cart and
  settings come from the client queries.
- The place-order button is disabled while an address error is unresolved
  (e.g. no address selected/entered).
- Order notes/PO number are optional free text (max lengths enforced).
