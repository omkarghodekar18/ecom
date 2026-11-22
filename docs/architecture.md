# Architecture

## Layers

```
Browser ─ proxy.ts (locale redirect, auth fast-gate)
        ─ Next.js RSC pages (server-rendered catalog/CMS content)
            ├─ fetch BACKEND_INTERNAL_URL (SSR, cookies forwarded)
            └─ client islands: TanStack Query (mutations/live data), Zustand (drawers/toasts)
        ─ /api/v1 rewrite → Express 5
             ├─ middleware chain (helmet, cors, compression, request-id, rate-limit, pino)
             ├─ modules (controller → service → repository)
             │     · repositories = only Prisma users; services = business logic
             ├─ services (mail, queue, cache, settings)
             └─ jobs (pg-boss workers: imports, emails, counts, revalidate, image-cleanup)
        ─ PostgreSQL (Prisma schema; tsvector/trigram search; partial indexes)
        ─ media: Cloudinary CDN (or local adapter /media/*)
```

## Module boundaries

Backend modules communicate only through each other's `index.ts` public API (madge-enforced).
Cross-cutting infrastructure lives in `src/services/` (queue, mail, cache, settings) and is
injected as interfaces so tests can swap implementations (`InlineQueueService` runs jobs
synchronously when `QUEUE_ENABLED=false`).

## Data flow highlights

- **Rendering**: catalog/CMS/brand pages are server-rendered with full HTML (SEO Section 13);
  cart/checkout/account/admin/search are `noindex` and more interactive. ISR + on-demand
  revalidation via `revalidate` jobs calling the frontend webhook (`/api/revalidate`, secret-
  protected, tag-scoped: `product:{slug}`, `category:{code}`, `navigation`, `home`).
- **Pricing** is always computed server-side (`PricingService`): customer price → quantity
  tier → list price. The client never sends prices.
- **Carts**: guest carts keyed by hashed cookie token; merged into the user cart on login.
- **Checkout** re-validates prices/stock inside one transaction, snapshots items, decrements
  stock (policy-dependent), clears the cart and enqueues the confirmation email.
- **Imports** run as queued jobs with a strict pipeline (parse → normalize → validate → plan →
  commit batches → postprocess) and a rollback journal (`ImportBatchItem`).

## Caching

1. Next.js data cache + tag cache (ISR).
2. In-process LRU `CacheService` (TTL, prefix invalidation) for facet metadata, navigation
   tree and settings — Redis-swappable behind the interface (ADR 0009 / Section 17).
3. HTTP cache headers (`s-maxage`, `stale-while-revalidate`) on public GETs.

## Scalability notes (Section 17)

Stateless API (12-factor, config via env), connection pooling via `DATABASE_URL` (pgBouncer-
compatible), pagination everywhere, read-optimised list DTOs (never `SELECT *`), maintained
aggregates (`Category.productCount`, `Product.minPrice`), background jobs for heavy work,
partial indexes for the hot listing path. Rate limiting and cache are in-memory today (single
instance); both are interface-backed for a Redis/Postgres store when scaling out.

This document grows per build phase; current build state is recorded in `BUILDLOG.md`.
