# cart

Guest + signed-in shopping cart: TanStack Query bindings, page/mini-cart
views and the shared add-to-cart control.

**Public surface:** `useCart`, `useAddToCart`, `useUpdateCartItem`,
`useRemoveCartItem`, `cartApi` (get/add/update/remove/merge/importCsv/
validateQuickOrder), `CartView` (cart page), `MiniCart` (header drawer),
`AddToCartButton` (PDP/listing/sticky-bar), `cartQueryKey`.

**Key flows**

- Guest: `th_cart` httpOnly cookie (60-day TTL) identifies the cart row.
- Signed-in: every call goes through `authFetch` — the bearer resolves the
  user cart; without a token the guest cookie still applies.
- Merge: after login the auth provider calls `cartApi.merge()`; the backend
  moves guest lines into the user cart and clears the cookie.
- Mutations write the returned cart straight into the `['cart']` cache and
  invalidate, so the header badge and mini-cart stay in sync everywhere.

**Gotchas**

- Never call these endpoints with plain `apiFetch` — a signed-in user whose
  guest cookie was consumed by the merge would silently see an empty cart.
- `useCart` is gated on `status !== 'loading'` so the first fetch happens
  after the silent boot refresh (the token must exist).
- Quantity rules (minOrderQty/packSize) and stock adjustments come back as
  `warnings[]` — surfaced via toasts by `announceWarnings`.
