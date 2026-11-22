# admin

Admin panel views and API client for the `/admin` route group (spec Section
15). Server components live in `src/app/(admin)/admin/**`; this feature holds
the client views.

**Public surface:** `AdminShell` (sidebar + role badge layout), `adminApi`
(typed client for all `/admin/*` endpoints) and one `*-view.tsx` per section:
dashboard, products (list/edit form, variants, media), categories, brands,
attributes, content, orders, imports (Import Center), customers, audit,
settings.

**Key flows**

- Auth: the `(admin)` layout resolves the session server-side and redirects
  non-STAFF/ADMIN users; `adminApi` calls attach the bearer via `authFetch`.
- DataTables: server-side pagination/sort/filter/search with URL-synced
  state; bulk actions confirm via modal and invalidate the list query.
- Import Center: upload (4 options) → live-polled job table → report with
  severity filter and per-issue codes → commit/rollback/cancel with
  confirmation; rollback is ADMIN-only.

**Gotchas**

- The jobs table and the report panel poll (1.5 s) independently while a job
  is in-flight — the report detail query needs its own `refetchInterval`
  (the upload endpoint returns before the dry run finishes).
- The upload input re-sets `event.target.value = ''` after reading so the
  same file can be re-selected.
- Everything under `/admin` is `noindex,nofollow` (layout metadata).
