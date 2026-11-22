# imports — Excel/CSV bulk import automation (spec Section 16)

Upload → dry run (validate everything, write nothing) → report → commit in
batches → optional rollback. Every issue carries a **stable code** from
`imports.errors.ts` — the Import Center UI, the error workbook and
`docs/import.md` all key off those codes.

## Pipeline (composable steps)

```
parse → normalize + validateSchema → validateRefs → validateUniqueness →
validateBusiness → plan (diff: create/update/skip) → commit (500 rows/txn) →
postProcess (minPrice, category counts, ISR revalidate, URL-image uploads)
```

- `parsers/import.parser.ts` — streaming xlsx reader (exceljs WorkbookReader,
  cached values only, formulas flagged) with a buffered fallback for
  re-saved workbooks; RFC-4180 CSV parser (flat Variants-style file, product
  fields grouped by `product_key`). Header aliases are case/space-insensitive
  and sheet-aware (`price` is `list_price` on Variants but stays `price` on
  PriceTiers/CustomerPrices).
- `schemas/sheet.schemas.ts` — L2: zod-style per-cell checks + normalisation
  (GTIN checksum, price separators, booleans, https/allow-list URLs, HTML
  sanitise with warning, enum mapping).
- `validators/` — one file per layer:
  - `file.validator.ts` (L1) — extension, magic bytes, 25 MB cap, macro/
    encryption sniffing BEFORE parsing (`preflightFile`); required sheets/
    headers, unknown columns, 50k row cap, empty-file rule AFTER parsing
    (`validateSheets`).
  - `refs.validator.ts` (L3) — category exists/active/leaf, brand policy,
    `product_key` resolution (file → DB by slug), attribute mapping + enum/
    number/unit checks, required + variant-axis attributes, axis-combination
    uniqueness. Loads all referenced rows in bulk (`buildRefContext`).
  - `uniqueness.validator.ts` (L4) — in-file duplicates (all rows reported),
    DB conflicts owned by another product, per-policy duplicate handling,
    slug-suffix warnings, ALREADY_IMPORTED (same SHA-256).
  - `business.validator.ts` (L5) — lead-time order, min-qty/pack multiples,
    tier quantity/price ordering, customer price vs list, date ranges, image
    count limit, published-needs-variant (error) / needs-image (warning).
- `committers/import.committer.ts` — the deterministic plan (`buildPlan`) and
  `commitPlan`: batches of 500 rows per transaction, every written row
  snapshotted into `ImportBatchItem.previous`, `postProcess` refreshes
  denormalised data and fetches URL images with per-image isolation
  (`strictImages` turns fetch failures into job failures). `rollbackImport`
  restores previous states in reverse order.
- `templates/template.generator.ts` — .xlsx template with README sheet,
  data-validation dropdowns, header comments, example row and optional
  category-specific `attr:` columns.
- `reports/error.report.ts` — downloadable error workbook (Summary by code +
  original rows with an `Errors` column).
- `imports.service.ts` — job lifecycle + queue wiring (dry run and commit run
  on pg-boss; the inline dev queue executes them during the request).

## API (STAFF/ADMIN; rollback ADMIN-only)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/admin/imports` | Upload base64 file (+ options); dry run starts |
| GET | `/admin/imports` | Paginated job list |
| GET | `/admin/imports/template?categoryCode=` | Template .xlsx |
| GET | `/admin/imports/:id` | Job + paginated issues (`severity` filter) |
| GET | `/admin/imports/:id/report` | Error workbook .xlsx |
| POST | `/admin/imports/:id/commit` | Only when zero errors; one commit at a time |
| POST | `/admin/imports/:id/rollback` | ADMIN; refused when a newer import completed |
| POST | `/admin/imports/:id/cancel` | Non-terminal jobs |

## Options (persisted on the job)

| Option | Values | Meaning |
| --- | --- | --- |
| `onDuplicateArticleNo` | `UPDATE` \| `SKIP` \| `FAIL` | Same-product article conflicts |
| `createMissingBrands` | bool | Auto-create unknown brands (slugified) |
| `publishStatus` | `DRAFT` \| `PUBLISHED` | Force drafts or respect file status |
| `strictImages` | bool | Image-fetch failures become errors |

## Error codes

See `docs/import.md` for the full table (code → layer → severity → message)
— generated from `IMPORT_CODES`, which is the single source of truth.

## Gotchas

- `product_key` maps to the product **slug** for updates; a file that
  re-imports an existing key plans UPDATEs, never duplicates.
- Warnings never block a commit — only ERROR-severity issues do.
- The commit worker RE-VALIDATES (L3/L4/L5) and fails with
  `VALIDATION_CHANGED` semantics if the catalog changed since the dry run.
- Rollback of a product CREATE soft-deletes the product; created variants
  are hard-deleted (they never existed before).
- Job files live in `backend/var/imports/<jobId>.<ext>`; the SHA-256 is
  stored on the job for idempotency warnings and audit.
- Tests: `tests/unit/import-validators.test.ts` (every code, pure) and
  `tests/integration/imports.test.ts` (full lifecycle + per-fixture codes).
  Fixtures: `tests/fixtures/import/` — regenerate with
  `npx tsx tests/fixtures/import/generate.ts`.
