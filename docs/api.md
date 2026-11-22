# API conventions

Base URL: `/api/v1` (Swagger UI: `/api/docs`, spec JSON: `/api/docs.json`). Every endpoint is
registered in the OpenAPI registry (`backend/src/openapi.ts` + per-module registrations).

## Response envelope

Success: `{ "success": true, "data": …, "meta"?: { page, pageSize, total, totalPages } }`
Failure: `{ "success": false, "error": { "code": "STABLE_CODE", "message": "human text", "details"?: … } }`

## Stability rules

- Error codes come from `backend/src/config/constants.ts` (`ERR`) and are part of the public
  contract: never renamed, only new codes added. Current codes: VALIDATION_ERROR, UNAUTHORIZED,
  FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, INTERNAL_ERROR, INVALID_CREDENTIALS,
  ACCOUNT_LOCKED, ACCOUNT_INACTIVE, EMAIL_UNVERIFIED, EMAIL_TAKEN, OTP_INVALID, OTP_EXPIRED,
  OTP_COOLDOWN, OTP_MAX_ATTEMPTS, TOKEN_INVALID, TOKEN_EXPIRED, CSRF_FAILED, CART_EMPTY,
  CART_MISMATCH, OUT_OF_STOCK, MIN_ORDER_QTY, PACK_SIZE, ORDER_NOT_FOUND, IDENTITY_TAKEN,
  IMPORT_INVALID_FILE, IMPORT_VALIDATION_FAILED, IMPORT_NOT_READY, IMPORT_LOCKED,
  PAYMENT_FAILED, STORAGE_ERROR, UNSAFE_URL.
- Validation: zod schemas in `backend/src/shared/dto/*` (mirrored to the frontend — ADR 0001).
- Pagination: `?page=&pageSize=` (max 100), default pageSize 24 (matches listing page sizes).
- Auth: `Authorization: Bearer <access JWT>` for API calls; rotating refresh token in the
  `th_rt` httpOnly cookie (`POST /auth/refresh`); CSRF double-submit (`th_csrf`) for
  cookie-authenticated mutations.
- Every response carries `x-request-id`; clients should send one or reuse it for tracing.
- Rate limits: 300 req/min/IP general (429 with RATE_LIMITED), stricter on auth endpoints.

## Cross-cutting middleware

helmet → CORS allow-list → compression → json/urlencoded (30 MB for import payloads) →
cookie-parser → request-id → rate-limit → pino-http → routes → 404 → centralized error handler
(AppError / Zod / Prisma P2002/P2025/P2003 mapping — see `src/common/errors/error-handler.ts`).

## Endpoint map (fills in as phases land)

- Health: `GET /health`, `GET /health/ready`
- Auth: register/verify-email, login (password + OTP), refresh rotation, logout(-all),
  password forgot/reset, `GET /auth/me`
- Catalog: navigation tree, category by code, children, filters, products listing with facets
- Products/PDP, search + suggest, pricing resolve
- Cart (guest + user, merge, CSV import), checkout validate/place-order, orders
- Quick order validate; CMS home/pages/banners; media sign-upload; admin CRUD; import endpoints
- SEO: sitemap chunks by type/page

Detailed per-endpoint reference: Swagger UI (always current) and `docs/openapi.json`
(`cd backend && npm run openapi:export` regenerates).
