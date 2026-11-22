# ADR 0001 — Two standalone projects, no monorepo tooling

**Status:** accepted (2026-11-21)
**Context:** The build spec (Section 3) requires `frontend/` and `backend/` as two completely independent npm projects with their own `package.json`, `node_modules` and `.env`, talking over HTTP only. No workspaces, no Turborepo/Nx, no shared `packages/` directory. Shared zod schemas are mirrored into a `shared/` folder inside each project and kept in sync manually.
**Decision:** Implemented exactly as specified. `scripts/sync-shared.mjs` (workspace helper, not part of either project) copies `backend/src/shared/` into `frontend/src/shared/` verbatim; files there may only import from `zod` and each other, so the copy is always valid on both sides.
**Consequences:** Duplicate dependencies (zod versions must stay in lockstep); no cross-project type imports. In exchange, each project deploys, versions and scales independently, which matches the spec's deployment story (Next.js on Vercel, Express on any Node host).
