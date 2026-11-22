# ADR 0007 — Local development database: user-space PostgreSQL 18 (no Docker)

**Status:** accepted (2026-11-21)
**Context:** Spec Section 19 keeps infrastructure minimal: "local dev assumes a plain local or hosted Postgres instance reachable via DATABASE_URL; no containerized Postgres required". The build environment provides no Docker and no root (apt install impossible), but a real PostgreSQL is required to run migrations, seeds and tests against the Postgres-specific features (tsvector, pg_trgm, unaccent).
**Decision:** Local dev/test uses the `embedded-postgres` npm distribution (PostgreSQL 18 binaries) started by `scripts/pg-start.sh` as the unprivileged user on `127.0.0.1:5433` (databases `toolhub`, `toolhub_test`). `backend/.env` points `DATABASE_URL`/`DIRECT_URL` there. In production (or on any developer machine with their own Postgres) nothing changes — only the env URLs.
**Consequences:** The database scripts are workspace helpers, not part of the deliverable projects. Supabase/Neon/RDS work by changing two env vars.
