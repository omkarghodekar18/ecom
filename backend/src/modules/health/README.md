# health module

Liveness and readiness probes.

**Public API** (`index.ts`): `healthRouter` — `GET /api/v1/health`, `GET /api/v1/health/ready`.

- `/health` is process-local (no DB call) and suitable for load-balancer probes.
- `/health/ready` pings Postgres with `SELECT 1` and reports degraded status rather
  than 5xx so orchestrators can distinguish "starting" from "broken".

Gotchas: none. No auth, no caching (skipped by the rate limiter).
