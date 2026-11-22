# Contributing

## Project layout rules (enforced by review + lint)

- Two standalone projects: `frontend/`, `backend/`. Nothing may import across the boundary —
  they talk over HTTP. Shared zod schemas live in `backend/src/shared/` and are MIRROD to
  `frontend/src/shared/` with `node scripts/sync-shared.mjs` after every change (ADR 0001).
- `backend/src/shared/**` may only import from `zod` and its own files — it must stay valid
  on both sides verbatim.
- Backend modules: `modules/<name>/{<name>.routes.ts, .controller.ts, .service.ts,
  .repository.ts, .schemas.ts, index.ts, README.md, __tests__/}`. Controllers parse/validate
  and delegate; services hold business logic; repositories are the ONLY layer touching Prisma.
  Modules import each other through `index.ts` public APIs only (madge-checked: `npm run lint:circ`).
- Frontend: `app/` holds routes only (thin); feature code lives in `features/<feature>`;
  shared UI primitives in `components/ui`; cross-cutting helpers in `lib/`.
- Files are small and single-purpose (< 250 lines target). Kebab-case file names, PascalCase
  components, named exports only. TypeScript `strict`, no `any` without an inline justification
  comment.

## Language conventions

- Backend is ESM (`"type": "module"`, NodeNext): every relative import ends with `.js`
  (`import { prisma } from '../db/prisma.js'`) — the compiler enforces it.
- Money is `Decimal(12,2)` in Postgres and travels as strings in JSON (never floats).
  Format client-side with `formatInr()` from `frontend/src/lib/format.ts`.
- Error codes: add to `backend/src/config/constants.ts` and document in `docs/api.md`.

## Commands

| Check | backend | frontend |
|---|---|---|
| typecheck | `npm run typecheck` | `npm run typecheck` |
| lint | `npm run lint` (+ `npm run lint:circ`) | `npm run lint` |
| tests | `npm test` | `npm test` |
| build | `npm run build` | `npm run build` |

A phase is done only when all of these pass AND the app boots.

## How to add things

- **Backend module**: create the folder per the layout above; register routes in
  `src/app.ts`; register OpenAPI paths in the module's routes file via the shared registry;
  add `README.md`; write `__tests__`.
- **Frontend page**: add route folder under `src/app/[country]/[lang]/…` (route groups
  `(shop)/(auth)/(account)/(admin)` carry their layouts); put components/hooks/API calls in
  `features/<feature>`; add URL builders to `config/routes.ts`.
- **CMS block**: extend the block registry in `features/cms` + backend `shared/dto/cms.dto.ts`,
  then sync-shared.
- **DB change**: edit `backend/prisma/schema.prisma`, `npm run db:migrate:dev -- --name <what>`,
  update `docs/database.md`. Raw SQL additions live in versioned migrations, never ad hoc.

## Branching & commits (repo level)

- Trunk-based: short-lived feature branches `feat/<area>-<what>`, `fix/…`; conventional
  commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).
- Husky + lint-staged run eslint/prettier on staged files when git hooks are installed
  (`npm run prepare` in either project).
