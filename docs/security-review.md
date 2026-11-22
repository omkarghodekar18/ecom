# Security Review (Phase 9 hardening)

Verification pass over the Section 23 ("non-functional acceptance") security
checklist, executed against the codebase on 2026-11-22. Every item lists where
the control lives and how it was verified.

## Checklist

| Requirement | Where | Verified by |
| --- | --- | --- |
| Input validation everywhere (zod) | Every route validates through zod schemas (`src/modules/*/*.schemas` / DTO schemas); env is zod-validated at boot (`src/config/env.ts`) | Code inspection; invalid-input integration tests per module |
| Output encoding / HTML sanitisation | `sanitizeDescriptionHtml` allow-list (`src/common/utils/html-sanitize.util.ts`) on product/CMS description writes and import L2 (warning `HTML_SANITIZED`); React escapes all storefront output | `products.service.ts:1046,1102`; import fixtures |
| Parameterised queries only | All data access through Prisma (`$queryRaw` usages are parameterised — no string concatenation of user input) | `grep -rn "queryRaw"` + review |
| Secure cookies | `th_rt` httpOnly + SameSite=Lax + Secure in prod (`src/modules/auth/session.cookies.ts`); `th_cart`/`th_csrf` non-httpOnly by design (double-submit / cookie gate) | `session.cookies.ts:13-25` |
| CSRF | Double-submit `th_csrf` cookie + `X-CSRF-Token` header on refresh/logout/queue-protected mutations (`src/common/middleware/csrf.ts`) | Auth integration tests (missing/invalid token → 403) |
| Strict CORS | Allow-list from `CORS_ORIGINS`, credentials enabled, non-browser tools (no Origin) pass (`src/app.ts:47-56`) | Manual probe with foreign Origin → rejected |
| Helmet + CSP | API: helmet with CSP off (pure JSON API; `app.ts:46`). Frontend: Next.js sets its headers; Cloudinary/fonts allowed via `next.config` headers | `app.ts`, `frontend/next.config.ts` |
| Rate limiting | Global API limiter + per-route auth limiters (`rate-limit.ts`); OTP service: 5 sends/h per email AND per IP, 60 s resend cooldown, 5 verify attempts | `otp.service.ts` (hit the 429 cap during e2e — confirmed live) |
| Secrets only in env | zod-validated env; `.env` git-ignored; no secrets in repo | `git grep` for key patterns — clean |
| Signed Cloudinary uploads | `POST /admin/media/sign-upload` validates folder/kind/size, signs server-side; only `publicId` stored | Media module + ADR 0012 |
| File-upload hardening | Extension + magic-byte sniffing, 25 MB cap, macro/encryption rejection, stored under `var/` outside web root (`imports` L1; media local adapter) | Import fixture suite (19 invalid workbooks) |
| SSRF protection | `assertFetchableUrl`: https-only, no userinfo, public-host check (private/loopback/link-local blocked), redirect hops re-validated, 10 s abort budget, size cap (`media.service.ts:75+`) | Unit tests + fixture |
| Open-redirect protection | `safeRedirect` allow-list on the frontend login `?redirect` (`safe-redirect.ts` + unit tests); no other redirect-with-user-input paths | `safe-redirect.test.ts` |
| Authorisation on every resource (IDOR) | Orders/addresses/quick-order scoped by `userId` in every query (`orders.service.ts:19-37`); admin routes behind STAFF/ADMIN guards; import rollback ADMIN-only | Integration tests (wrong-user access → 404) |
| Audit logs | `AuditLog` for admin mutations, `AuthEvent` for auth flows (incl. OTP_REQUEST rate counting) | Admin audit UI + module |
| Dependency audit | `npm audit` both projects (see below) | This review |
| No PII in logs | Pino redact paths: `authorization`, `cookie`, `*.password`, `*.passwordHash`, `*.token` (`config/logger.ts:9-11`) | Logger config |

## Dependency audit (2026-11-22)

- **frontend: 0 vulnerabilities.**
- **backend: 6 (2 moderate, 4 high)** — all in tooling/transitive dependencies,
  not reachable from request handling:
  - `deepmerge-ts < 8.0.0` (high, stack exhaustion on recursive object graphs)
    and `effect ≤ 3.22.0` (high, ReDoS in `Schema.TemplateLiteral`) — both
    transitive via `@prisma/config`/`prisma` **CLI** packages, used only for
    `prisma generate/migrate` at development time, never imported by the
    running server.
  - `uuid < 11.1.1` (moderate, missing buffer bounds check in v3/v5/v6 *when
    a caller-provided buffer is used*) — transitive via `exceljs`, which uses
    uuid v4 without buffers; the vulnerable code path is not exercised.
- **Decision:** upgrades are only available as breaking changes (Prisma 6 → 7,
  exceljs downgrade). Prisma 6 is a documented architecture decision
  (`docs/adr/0004-prisma-6-generator.md`); swapping the ORM/stack in the
  hardening phase is not a proportionate response to dev-CLI advisories.
  Re-run `npm audit` as part of routine maintenance; revisit when Prisma 7
  migration happens (or advisories gain runtime reachability).

## Findings fixed during this phase (found by the e2e suite)

1. **Unauthenticated `/admin/*` redirected to a nonexistent `/admin/login`**
   (Next proxy) — produced a storefront 404 instead of the login page. Fixed:
   the proxy now redirects to `/in/en/login?redirect=…` exactly like the
   admin layout does (`frontend/src/proxy.ts`).
2. **Signed-in cart calls sent no bearer token** — `cartApi` used plain
   `apiFetch`, so after login (guest cookie consumed by the merge) every cart
   read/mutation resolved as a guest: empty cart despite a successful merge.
   Fixed: all cart calls go through `authFetch`, and `useCart` waits for the
   silent boot refresh so the in-memory token exists before the first fetch
   (`cart-api.ts`, `use-cart.ts`).
3. **Import report panel could go permanently stale** — the detail query had
   no polling; opening the report while the dry run was still queued showed an
   empty report (0/0/0, no Commit button) forever. Fixed: the detail query
   polls every 1.5 s while the selected job is in flight
   (`import-center-view.tsx`).

## Remaining accepted risks

- Local-adapter media (dev default) serves `var/uploads` from the API origin
  without a CDN — production deployments use the Cloudinary adapter (ADR 0012).
- The file mail provider writes emails (including OTP codes) to
  `backend/var/outbox` in development — dev-only; production uses SMTP. The
  outbox directory is git-ignored.
