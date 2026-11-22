# admin

Cross-domain admin surface (spec Section 15) — the domain modules (catalog,
attributes, brands, products, cms, media) own their `/admin/...` CRUD routes;
this module adds everything that spans modules.

## Purpose

- **Dashboard** (`GET /admin/stats`): catalog counts, 30-day order/revenue
  KPIs, pending orders, failed imports, latest orders, low-stock watchlist.
- **Orders admin** (`/admin/orders...`): filtered list + CSV export, detail
  with buyer, state-machine-validated status transitions (+ notes) writing
  OrderEvent + audit rows, confirmation-email resend.
  State machine: PENDING→CONFIRMED→PROCESSING→SHIPPED→DELIVERED;
  CANCELLED only from PENDING/CONFIRMED/PROCESSING.
- **Users/Companies** (`/admin/users`, `/admin/companies`): lists + edits
  (activate/deactivate, role; company name/GSTIN/customer number). Self-guard:
  you cannot deactivate or demote your own account.
- **Audit viewer** (`GET /admin/audit-logs`): paginated trail with actor email.
- **Settings** (`GET|PATCH /admin/settings`): tax, shipping (incl. optional
  express rate), stock policy, feature flags — validated per key, audited.

## RBAC

STAFF: stats + orders. ADMIN: everything (users, companies, audit, settings).
Enforced via `authorize('STAFF','ADMIN')` / `authorize('ADMIN')`.

## Gotchas

- Order status updates do NOT auto-email the customer — resend is explicit
  (`POST .../resend-email`), so staff control what customers receive.
- CSV export reuses the list filters and streams up to 50 000 rows as text/csv.

## Testing

`__tests__/admin.test.ts` — RBAC matrix, stats shape, order state machine
(valid + invalid transitions), user self-guard, audit listing.
