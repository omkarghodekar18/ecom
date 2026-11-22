# ADR 0004 — Prisma 6 (prisma-client-js generator), not Prisma 7

**Status:** accepted (2026-11-21)
**Context:** The spec pins the schema's generator to `provider = "prisma-client-js"` and `directUrl` in the datasource block. Prisma 7 (current major) removed the `prisma-client-js` generator in favour of the `prisma-client` generator and requires driver adapters by default — the spec's schema block would not be valid Prisma 7 source.
**Decision:** Pin `prisma@^6.19.3` / `@prisma/client@^6.19.3`. The schema from the spec runs verbatim (validated + migrated in this build). Node 22 LTS engine requirement is unaffected.
**Consequences:** Staying on the 6.x line keeps the spec text authoritative. Upgrade path (when needed): switch generator to `prisma-client`, add `@prisma/adapter-pg`, and migrate `searchVector` handling — documented as future work in `docs/deployment.md`.
