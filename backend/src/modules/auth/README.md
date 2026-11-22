# auth module

Registration, email verification (OTP), password + passwordless (OTP) login,
rotating refresh sessions, logout, password reset. Spec Section 10.

**Public API** (`index.ts`): `authRouter`, `sanitizeUserToMe`, `GENERIC_AUTH_MESSAGE`.

## Endpoints (all under `/api/v1`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register` | – | 202 generic message (anti-enumeration) |
| POST | `/auth/verify-email` | – | 200 `{user, accessToken}` + session cookies |
| POST | `/auth/login/password` | – | 200 `{user, accessToken}` + session cookies |
| POST | `/auth/login/otp/request` | – | 202 generic message |
| POST | `/auth/login/otp/verify` | – | 200 `{user, accessToken}` + session cookies |
| POST | `/auth/refresh` | cookie + CSRF | rotates `th_rt`, reuse detection kills the family |
| POST | `/auth/logout` | cookie + CSRF | 204 |
| POST | `/auth/logout-all` | Bearer | 204 |
| POST | `/auth/password/forgot` | – | 202 generic message |
| POST | `/auth/password/reset` | – | 204, revokes all sessions |
| GET | `/auth/me` | Bearer | MeDto |

## Key flows

- **Sessions**: access JWT (15 min, payload `{sub, role, type, sid}`) in the
  JSON body; refresh token (48-byte hex, HMAC-hashed at rest, `familyId`) in
  the httpOnly `th_rt` cookie scoped to `/api/v1/auth`. Every refresh rotates
  the token within the same family; presenting a revoked token revokes the
  entire family (theft response). `sid` in the access JWT marks the current
  session for `/users/me/sessions`.
- **CSRF**: `th_csrf` (readable) must be echoed in `X-CSRF-Token` for
  cookie-authenticated mutations (`/auth/refresh`, `/auth/logout`).
- **OTP**: 6 digits, HMAC-hashed, 10 min TTL, 5 verify attempts, 60 s resend
  cooldown, max 5 sends/hour per email and per IP (AuthEvent-based). OTP rows
  are created for ANY email so behaviour cannot probe account existence;
  only the mail sending is conditional.
- **Anti-enumeration**: register / forgot / otp-request always answer
  `202 {message: GENERIC_AUTH_MESSAGE}`; login failures are always
  `401 INVALID_CREDENTIALS`; unknown emails still run an argon2 verify
  (timing equaliser).
- **Lockout**: ≥5 `LOGIN_FAIL` AuthEvents for an email in 15 min →
  `429 ACCOUNT_LOCKED {retryAfterMin}`; ≥5 per IP → `429 RATE_LIMITED`.
- **RBAC**: roles live in the access JWT; `authorize(...roles)` guards
  role-specific routes (none in this module).

## Gotchas

- Repositories are the only Prisma users; they accept an optional
  transaction client (`withTransaction`) for atomic writes.
- `CUSTOMER` self-registration only; STAFF/ADMIN come from the seed.
- B2B registration auto-creates a `Company` with `CUST-000001`-style numbers
  (count-based sequence; unique-constraint retries are not handled — a
  concurrent collision returns 409 CONFLICT from the error handler).
