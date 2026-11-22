# Deployment guide

ToolHub India is two standalone Node services plus a PostgreSQL database. No
CI/CD or containerisation ships with this repo (spec Section 19 — out of
scope); this page documents what a production deployment must provide.

## Topology

```
        ┌────────────────────────── CDN / reverse proxy (TLS) ─────────────────────────┐
        │                                                                              │
        │  /            → frontend (Next.js 16, `next start`, port 3000)                │
        │  /api/v1/*    → either proxied to backend:4000 or served via the frontend     │
        │                 rewrite (NEXT_PUBLIC_API_URL=/api/v1, same-origin)           │
        └──────────────────────────────────────────────────────────────────────────────┘
   backend (Express 5, `node dist/server.js`, port 4000)
        ├─ PostgreSQL 14+ (Prisma 6; pooled URL for runtime, direct URL for migrations)
        ├─ SMTP (MAIL_PROVIDER=smtp) — the `file` provider is dev-only
        ├─ Cloudinary (STORAGE_ADAPTER=cloudinary) — the `local` adapter is dev-only
        └─ pg-boss schema in the same database (QUEUE_ENABLED=true)
```

## Backend

1. **Build & run** — `npm ci && npm run build && npm run start` (`tsc` →
   `dist/server.js`; Node 22+). One process is fine to start; the app is
   stateless except for the in-memory rate-limit and LRU cache stores — run
   one instance first and put a load balancer with sticky IP hashing in front
   if you scale out (or swap both stores for the Postgres/Redis adapters
   flagged in `docs/architecture.md`).
2. **Migrations** — `npm run db:migrate` (`prisma migrate deploy`, uses
   `DIRECT_URL`). Seed only fresh environments: `npm run db:seed`.
3. **Environment** — copy `backend/.env.example`; every variable is
   documented inline. Mandatory in production:
   - `NODE_ENV=production` — switches cookies to `Secure`, tightens logging.
   - `DATABASE_URL` (+ pooled `DIRECT_URL` for migrations).
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `HMAC_SECRET` — 32+ random
     chars each (`openssl rand -hex 32`).
   - `CORS_ORIGINS` — the exact frontend origins, no wildcards.
   - `PUBLIC_API_URL` (used in emails/OpenAPI), `FRONTEND_INTERNAL_URL`
     (revalidation worker), matching `REVALIDATE_SECRET` on the frontend.
   - `MAIL_PROVIDER=smtp` + `SMTP_URL` + `MAIL_FROM`.
   - `STORAGE_ADAPTER=cloudinary` + the three Cloudinary keys.
   - `PAYMENT_PROVIDER` — `invoice` (default B2B) or `razorpay` (+ keys).
   - `API_RATE_LIMIT` — general per-IP quota (default 300/min). Raise only
     for load tests.
4. **Uploads** — `backend/var/` must be a persistent volume while the local
   media adapter is in use; with Cloudinary nothing is written there except
   import source files (retain for rollback forensics or clean up on a
   schedule).
5. **Health** — `GET /api/v1/health` (exempt from rate limiting) for probes.
6. **Security headers** — the API is JSON-only (helmet with CSP off); the
   frontend/CDN layer is the right place for the site-wide CSP, HSTS and
   frame/origin policies (Cloudinary + Google Fonts must be allowed).

## Frontend

1. **Build & run** — `npm ci && npm run build && npm run start` (port 3000).
   All catalogue routes are SSG/ISR — the first `next start` boot warms the
   ISR cache; on-demand revalidation keeps it fresh.
2. **Environment** (`frontend/.env.local.example`): `NEXT_PUBLIC_SITE_URL`
   (canonical URLs, sitemaps, JSON-LD), `NEXT_PUBLIC_API_URL` (`/api/v1`
   same-origin via rewrite, or the API origin), `BACKEND_INTERNAL_URL`
   (server→API fetches), `REVALIDATE_SECRET` (must match the backend),
   Cloudinary cloud name (image loader).
3. **Scaling** — stateless; ISR cache is per-instance, so run the revalidate
   webhook through every instance (or front the instances with a shared CDN).

## Database

- PostgreSQL 14+; the two extensions `pg_trgm` and `unaccent` are installed by
  the initial migration (verified in `docs/database.md`).
- Backups: standard `pg_dump`/PITR; the schema keeps soft-deletes and audit
  tables (`AuditLog`, `AuthEvent`, `ImportBatchItem.previous` snapshots) so
  restores preserve import-rollback history.

## Post-deploy checklist

- [ ] `GET /api/v1/health` returns `status: ok`.
- [ ] `GET {frontend}/in/en` renders; `/in/en/login` rejects with the rate
      limit headers present after bursts.
- [ ] Admin sign-in works and `/admin` is `noindex`.
- [ `docs/openapi.json`] matches the deployment (`npm run openapi:export`).
- [ ] A test order (place order → confirmation email via SMTP → order
      visible in account history) completes.
- [ ] Sitemap `lastmod` reflects current catalogue (`/sitemap.xml`).
- [ ] Lighthouse spot-check on home/category/PDP (targets: SEO ≥ 95,
      Accessibility ≥ 90 — see `docs/seo.md`).
