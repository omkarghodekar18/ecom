# ADR 0006 — Explicit-path dotenv loading

**Status:** accepted (2026-11-21)
**Context:** dotenv v18 searches parent directories for `.env` files. In this workspace a template `.env` exists at the workspace root (containing an unrelated SQLite `DATABASE_URL`); without precautions it silently overrides the standalone backend's own `.env` values.
**Decision:** `backend/src/load-env.ts` loads ONLY `<cwd>/.env` with `override: true` via `dotenv.config({ path, override, quiet })`. Every entrypoint (server, scripts, prisma seed) imports it first. Tests set env explicitly in `tests/setup.ts` before any module import.
**Consequences:** Process environment still wins over nothing (override:true re-reads the file each boot); a stray parent `.env` can never leak in. Documented contract: run backend scripts from `backend/`.
