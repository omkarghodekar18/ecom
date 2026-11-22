# Bulk import (Excel/CSV) — columns, rules and error codes

The Import Center (`/admin/imports`) implements spec Section 16. This page
documents the workbook format, the validation layers and every stable error
code. The machine-readable source of truth is
`backend/src/modules/imports/imports.errors.ts` (`IMPORT_CODES`).

## User flow

1. **Download template** — server-generated `.xlsx` with a README sheet,
   dropdowns, header comments and an example row. Pass `categoryCode` to
   pre-fill that category's `attr:` columns (with enum dropdowns).
2. **Upload** `.xlsx`/`.csv` (≤ 25 MB, ≤ 50,000 variant rows) with options:
   - `onDuplicateArticleNo`: `UPDATE` | `SKIP` | `FAIL` (same-product conflicts)
   - `createMissingBrands`: yes/no
   - `publishStatus`: `DRAFT` (force drafts) | `PUBLISHED` (respect file)
   - `strictImages`: image-fetch failures become errors
3. **Dry run (always first)** — validates everything without writing; the
   report shows totals, issues grouped by code, a filterable issue table and
   a downloadable error `.xlsx` (original rows + `Errors` column).
4. **Commit** — only with zero errors; runs in batches of 500 rows per
   transaction with live progress; only one commit at a time.
5. **Rollback** (ADMIN) — restores every `ImportBatchItem.previous` snapshot
   in reverse order; refused when a newer import completed.

`product_key` is your own id, unique within the file. For updates it must
match an existing product **slug** (that is how the import finds the product).

## Workbook structure

| Sheet | Required | Columns |
| --- | --- | --- |
| **Products** | yes | `product_key`*, `name`*, `brand`*, `category_code`*, `short_description`, `description_html`, `is_bestseller`, `status`, `seo_title`, `seo_description` |
| **Variants** | yes | `product_key`*, `article_no`*, `ean`, `list_price`*, `currency`, `price_unit`, `unit_label`, `stock_qty`, `lead_time_min_days`, `lead_time_max_days`, `min_order_qty`, `pack_size`, `is_active`, + dynamic `attr:<key>` columns |
| **Images** | no | `article_no` or `product_key`, `image_url` (https, allow-listed) or `zip_filename`, `kind` (PHOTO/DIMENSION/APPLICATION/PACKAGING/VIDEO), `alt`, `sort_order` |
| **Documents** | no | `product_key`, `kind` (DATASHEET/MANUAL/CERTIFICATE/SAFETY/DRAWING), `title`, `url` |
| **PriceTiers** | no | `article_no`, `min_qty`, `price` |
| **CustomerPrices** | no | `customer_number`, `article_no`, `price`, `valid_from`, `valid_to` (YYYY-MM-DD) |

CSV imports accept a single flat Variants-style file: one header line with
the union of product + variant columns, product fields repeated per
`product_key` group (the first row of each group wins). UTF-8 (BOM allowed).

Header aliases are case/space-insensitive (`Article No` → `article_no`,
`EAN13` → `ean`, …). `price` means `list_price` on Variants/CSV but stays
`price` on PriceTiers/CustomerPrices; `url` means `image_url` only on Images.

Booleans: `true/false/yes/no/1/0`. Prices: positive, ≤ 2 decimals,
`1234.56` or `1234,56` or grouped `1,234.56` / `1.234,56` (mixed/ambiguous →
error). EAN: GTIN-8/12/13/14 with checksum. Article numbers: letters, digits,
space, dot, comma, slash, dash; ≤ 40 chars. Image hosts must be https and on
the allow-list (`IMPORT_IMAGE_DOMAINS`, default `res.cloudinary.com`,
`upload.wikimedia.org`) with an image extension.

## Error codes (stable, by layer)

### L1 — file level
| Code | Severity | Meaning |
| --- | --- | --- |
| `FILE_TOO_LARGE` | error | > 25 MB |
| `FILE_BAD_EXTENSION` | error | only .xlsx/.csv (.xlsm rejected) |
| `FILE_BAD_MAGIC` | error | content does not match extension |
| `FILE_PASSWORD_PROTECTED` | error | encrypted workbook |
| `FILE_MACROS` | error | macro project embedded |
| `FILE_EMPTY` | error | no data rows |
| `FILE_SHEETS_MISSING` | error | required sheet or column missing |
| `FILE_HEADERS_INVALID` | warning | unknown column ignored |
| `FILE_ROW_LIMIT` | error | > 50,000 variant rows |
| `FILE_ENCODING` | error | CSV not UTF-8 |

### L2 — cell/row schema
| Code | Severity | Meaning |
| --- | --- | --- |
| `CELL_REQUIRED` | error | required cell empty |
| `CELL_MAX_LENGTH` | error | over the length limit |
| `ARTICLE_NO_INVALID` | error | charset/format check |
| `EAN_FORMAT` | error | not GTIN-8/12/13/14 digits |
| `EAN_CHECKSUM` | error | wrong check digit |
| `PRICE_INVALID` | error | not positive / > 2 dp |
| `PRICE_SEPARATORS` | error | ambiguous decimal separators |
| `INT_INVALID` | error | expected non-negative integer |
| `BOOL_INVALID` | error | not true/false/yes/no/1/0 |
| `URL_NOT_HTTPS` | error | non-https URL |
| `URL_DOMAIN` | error | host not on the allow-list |
| `URL_EXTENSION` | error | disallowed file extension |
| `ENUM_INVALID` | error | outside allowed enum (status, kinds) |
| `HTML_SANITIZED` | warning | tags stripped from the allow-list |
| `FORMULA_CELL` | warning | formula found — cached value used |
| `DATE_INVALID` | error | unparseable date |

### L3 — referential
| Code | Severity | Meaning |
| --- | --- | --- |
| `CATEGORY_NOT_FOUND` | error | category_code unknown |
| `CATEGORY_NOT_ACTIVE` | error | category deactivated |
| `CATEGORY_NOT_LEAF` | error | category has children |
| `BRAND_NOT_FOUND` | error | brand missing and createMissingBrands off |
| `PRODUCT_KEY_MISSING` | error | key neither in file nor DB |
| `ATTRIBUTE_NOT_MAPPED` | error | attr not mapped to the category |
| `ENUM_VALUE_INVALID` | error | value not in the attribute's enum |
| `NUMBER_ATTRIBUTE_INVALID` | error | non-numeric number-attribute |
| `UNIT_MISMATCH` | warning | value unit differs from definition |
| `REQUIRED_ATTRIBUTE_MISSING` | error | required category attribute absent |
| `VARIANT_AXIS_MISSING` | error | variant-axis attribute absent |
| `AXIS_DUPLICATE` | error | axis combination exists in product |

### L4 — uniqueness & duplicates
| Code | Severity | Meaning |
| --- | --- | --- |
| `DUPLICATE_IN_FILE` | error | article_no/ean/product_key repeated (all rows listed) |
| `ARTICLE_NO_CONFLICT` | error | article belongs to a different product |
| `EAN_CONFLICT` | error | EAN belongs to another variant |
| `DUPLICATE_POLICY` | warning/error | per-policy SKIP/FAIL outcome |
| `SLUG_SUFFIX` | warning | slug collision auto-suffixed |
| `ALREADY_IMPORTED` | warning | same file SHA-256 imported before |

### L5 — business rules
| Code | Severity | Meaning |
| --- | --- | --- |
| `LEAD_TIME_ORDER` | error | min > max lead time |
| `MIN_QTY_PACK` | error | min_order_qty not a multiple of pack_size |
| `TIER_QUANTITY_ORDER` | error | tier quantities not strictly increasing |
| `TIER_PRICE_ORDER` | error | tier prices increase with quantity |
| `CUSTOMER_PRICE_ABOVE_LIST` | warning | customer price > list price |
| `DATE_RANGE` | error | valid_from > valid_to |
| `IMAGE_COUNT_LIMIT` | error | > 12 images per product |
| `PUBLISHED_NO_VARIANT` | error | published product without variants |
| `PUBLISHED_NO_IMAGE` | warning | published product without image |

### Lifecycle
| Code | Where | Meaning |
| --- | --- | --- |
| `VALIDATION_CHANGED` | commit | catalog changed since the dry run |
| `JOB_STATE_INVALID` | commit | job not READY_TO_COMMIT |
| `COMMIT_LOCKED` | commit | another import is committing |

## Fixtures

`backend/tests/fixtures/import/` contains `valid.xlsx` plus one
`invalid-*.xlsx` per error class (regenerate:
`cd backend && npx tsx tests/fixtures/import/generate.ts`). The seed also
ships a realistic `backend/prisma/seed/sample-import.xlsx` (3 families,
8 variants, mixed stock/lead times).
