# ADR 0011 — Session cookies use path '/', session presence signalled by th_csrf

**Status:** accepted (2026-11-21)
**Context:** Spec Section 10 specifies a rotating refresh token in an httpOnly cookie plus CSRF
protection (double-submit). Two integration needs constrain the cookie attributes: the Next.js
proxy gate (spec Section 7) must see a session cookie on page requests, and client JS must read
the CSRF token from `document.cookie` to send the `X-CSRF-Token` header during the silent boot
refresh. Path-scoping the cookies to `/api/v1/auth` (a first instinct for minimizing exposure)
breaks both: browsers would not send the cookie on page navigations, and `document.cookie` on
storefront paths could not see `th_csrf`. Additionally `th_rt` is httpOnly and therefore can
never serve as a JS-visible "has session?" signal.
**Decision:** Both cookies (`th_rt` httpOnly, `th_csrf` readable) are set with `path: '/'`,
`SameSite=Lax`, `Secure` in production. The silent-boot check reads `th_csrf` (same lifecycle as
`th_rt`: set together on login/refresh, cleared together on logout). Security is carried by
httpOnly + SameSite + the CSRF double-submit check, not path scoping.
**Consequences:** The refresh cookie rides on same-origin requests to the Next server (GET page
loads) — harmless: mutations require the Bearer token, and refresh/logout require the CSRF
header. Verified live: silent refresh on page load, proxy gate, full login → account flows.
