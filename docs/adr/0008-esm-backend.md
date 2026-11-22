# ADR 0008 — Backend: ESM (NodeNext) with .js import suffixes

**Status:** accepted (2026-11-21)
**Context:** The backend targets Node 22 LTS with Express 5 and TypeScript strict. Both CommonJS and ESM are viable; the frontend is ESM by nature.
**Decision:** `"type": "module"` with `module: NodeNext` / `moduleResolution: NodeNext`; relative imports use explicit `.js` suffixes (checked by `tsc`). tsx runs TypeScript directly in dev; `tsc` emits to `dist/` for production.
**Consequences:** All packages used (express 5, pg-boss 12, nodemailer 10, exceljs, fast-csv) are ESM-compatible. The `.js` suffix convention is documented in `docs/contributing.md` and enforced by the compiler.
