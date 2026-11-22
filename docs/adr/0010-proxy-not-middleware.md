# ADR 0010 — Next.js 16 proxy.ts (middleware renamed upstream)

**Status:** accepted (2026-11-21)
**Context:** The spec (Section 7) says "Auth is enforced in middleware.ts". Next.js 16 renamed `middleware.ts` to `proxy.ts` (middleware still works for Edge cases but is deprecated); the spec's intent is the edge-level router gate.
**Decision:** The gate lives in `frontend/src/proxy.ts` exporting `proxy()` + `config.matcher`: root/locale redirect and a fast cookie-presence gate for `/admin/*` and account/checkout paths. The real session verification always happens server-side (layouts/actions) as the spec requires — the proxy is only a UX fast-path, never an authority.
**Consequences:** Same behaviour the spec describes; future Next versions keep working. If middleware-style Edge code is ever needed, `proxy.ts` is the supported location.
