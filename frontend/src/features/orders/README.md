# orders

Account order history + detail (spec 6.9): list with status badges, detail
with the status timeline, line snapshots, reorder and invoice download.

**Public surface:** `OrdersView` (mounted by
`app/[country]/[lang]/(account)/my-company/orders/**`).

**Key flows**

- `GET /orders` (paged) and `GET /orders/:orderNo` via `authFetch` — the
  backend scopes every query to the caller's `userId` (IDOR-safe).
- Reorder (`POST /orders/:orderNo/reorder`) re-adds the order's lines
  server-side; unavailable articles come back as cart warnings.
- Invoice download is a placeholder action (FileText button) pending the
  invoicing integration.

**Gotchas**

- Client-rendered like the rest of the account area; `noindex` on the pages.
- Order numbers follow `ORD-YYYY-NNNNNN` — tests assert this pattern.
