# auth

Session management for the storefront: provider, API client, CSRF/cookie
helpers and the open-redirect guard.

**Public surface:** `AuthProvider`/`useAuth` (status: `loading | guest |
authenticated`), `authFetch` (bearer + one silent refresh retry), `safeRedirect`,
`csrfHeaders`.

**Key flows**

- Boot: `AuthProvider` runs one silent `POST /auth/refresh` (httpOnly `th_rt`
  cookie) to restore the session; the in-memory access token store is filled
  from the response. `useAuth().status` flips `loading → guest|authenticated`.
- Login (password or OTP tabs on `/login`): on success `login(user, token)`
  is called — it stores the token, seeds the `me` cache and fires the
  best-effort `POST /cart/merge` (guest cart → user cart).
- OTP: `POST /auth/login/otp/request` → 6-digit code by mail → `…/verify`.
  Backend limits: 5 sends/h per email AND per IP, 60 s resend cooldown,
  5 verify attempts (429s carry `retryAfterSec`).

**Gotchas**

- The access token lives in memory only — any fetch that must act as the
  signed-in user goes through `authFetch`, never plain `apiFetch`.
- Queries that depend on the session wait for `status !== 'loading'` (see
  `features/cart/use-cart.ts`) or they race the boot refresh.
- `safeRedirect` allow-lists the `?redirect` param (same-origin paths only);
  always use it for post-login navigation.
- e2e helpers reset the OTP send-limit counters before a run
  (`backend/scripts/reset-otp-rate-limit.cjs`, local DBs only).
