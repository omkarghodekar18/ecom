// Stable import issue codes (spec 16.3): every validation layer emits issues
// with a code from THIS registry (never inline strings) so the Import Center
// UI, the error xlsx and the docs can group/filter on them. Adding a code
// requires a row in the module README and docs/import.md.
import { z } from 'zod';

export type IssueSeverity = 'ERROR' | 'WARNING';

export interface ImportIssueDraft {
  sheet: string;
  rowNumber: number;
  column?: string;
  severity: IssueSeverity;
  code: ImportIssueCode;
  message: string;
  rawValue?: string;
}

/** All stable codes grouped by validation layer (prefix = layer). */
export const IMPORT_CODES = {
  // L1 file-level
  FILE_TOO_LARGE: 'File exceeds the 25 MB limit.',
  FILE_BAD_EXTENSION: 'Only .xlsx and .csv files are accepted (.xlsm with macros is rejected).',
  FILE_BAD_MAGIC: 'File content does not match its extension (magic-byte sniffing failed).',
  FILE_PASSWORD_PROTECTED: 'Password-protected workbooks cannot be parsed.',
  FILE_MACROS: 'Macro-enabled workbooks (.xlsm) are rejected for safety.',
  FILE_EMPTY: 'The file contains no data rows.',
  FILE_SHEETS_MISSING: 'A required sheet or header row is missing.',
  FILE_HEADERS_INVALID: 'Duplicate or unknown required columns.',
  FILE_ROW_LIMIT: 'More than 50,000 variant rows in one file.',
  FILE_ENCODING: 'CSV files must be UTF-8 (BOM allowed).',
  // L2 cell/row schema
  CELL_REQUIRED: 'A required cell is empty.',
  CELL_MAX_LENGTH: 'Value exceeds the maximum length.',
  ARTICLE_NO_INVALID: 'Article number failed the format check (allowed: letters, digits, space, dot, slash, dash).',
  EAN_FORMAT: 'EAN must be GTIN-8/12/13/14 digits.',
  EAN_CHECKSUM: 'EAN checksum digit is wrong.',
  PRICE_INVALID: 'Price must be a positive decimal with at most 2 decimal places.',
  PRICE_SEPARATORS: 'Mixed decimal separators are ambiguous — use one format.',
  INT_INVALID: 'Expected a non-negative integer.',
  BOOL_INVALID: 'Booleans accept true/false/yes/no/1/0.',
  URL_NOT_HTTPS: 'URLs must use https.',
  URL_DOMAIN: 'Image/document domain is not on the allow-list.',
  URL_EXTENSION: 'File extension is not allowed for this kind of asset.',
  ENUM_INVALID: 'Value is outside the allowed enumeration.',
  HTML_SANITIZED: 'HTML was sanitized (tags removed from the allow-list).',
  FORMULA_CELL: 'Cell contains a formula — only the cached value is read.',
  DATE_INVALID: 'Date could not be parsed (use YYYY-MM-DD).',
  // L3 referential
  CATEGORY_NOT_FOUND: 'category_code does not exist.',
  CATEGORY_NOT_ACTIVE: 'Category is deactivated.',
  CATEGORY_NOT_LEAF: 'Products may only be imported into leaf categories.',
  BRAND_NOT_FOUND: 'Brand does not exist and createMissingBrands is off.',
  PRODUCT_KEY_MISSING: 'product_key is neither in the Products sheet nor in the database.',
  ATTRIBUTE_NOT_MAPPED: 'Attribute is not mapped to the product\'s category.',
  ENUM_VALUE_INVALID: 'Value is not in the attribute\'s enum list.',
  NUMBER_ATTRIBUTE_INVALID: 'Number attribute got a non-numeric value.',
  UNIT_MISMATCH: 'Value unit differs from the attribute definition.',
  REQUIRED_ATTRIBUTE_MISSING: 'A required category attribute is missing.',
  VARIANT_AXIS_MISSING: 'A variant-axis attribute is missing.',
  AXIS_DUPLICATE: 'Variant-axis combination already exists for this product.',
  // L4 uniqueness & duplicates
  DUPLICATE_IN_FILE: 'Duplicate value inside the file (all involved rows are reported).',
  ARTICLE_NO_CONFLICT: 'article_no already belongs to a different product in the database.',
  EAN_CONFLICT: 'ean already belongs to a different variant in the database.',
  DUPLICATE_POLICY: 'Row skipped per the on-duplicate policy.',
  SLUG_SUFFIX: 'Slug collision auto-resolved with a suffix.',
  ALREADY_IMPORTED: 'The same file (SHA-256) was imported before — re-run may duplicate work.',
  // L5 business rules
  LEAD_TIME_ORDER: 'lead_time_min_days must be ≤ lead_time_max_days.',
  MIN_QTY_PACK: 'min_order_qty must be a multiple of pack_size.',
  TIER_QUANTITY_ORDER: 'Tier quantities must be strictly increasing.',
  TIER_PRICE_ORDER: 'Tier prices must be non-increasing as quantity grows.',
  CUSTOMER_PRICE_ABOVE_LIST: 'Customer price exceeds the list price.',
  DATE_RANGE: 'valid_from must be ≤ valid_to.',
  IMAGE_COUNT_LIMIT: 'More images per product than allowed.',
  PUBLISHED_NO_VARIANT: 'A published product needs at least one active variant.',
  PUBLISHED_NO_IMAGE: 'A published product has no image (storefront shows a placeholder).',
  // lifecycle
  VALIDATION_CHANGED: 'Catalog changed since the dry run — re-run the dry run.',
  JOB_STATE_INVALID: 'The job is not in a state that allows this action.',
  COMMIT_LOCKED: 'Another import is currently committing — try again later.',
} as const;

export type ImportIssueCode = keyof typeof IMPORT_CODES;

/** Convenience constructors keeping the call sites terse. */
export const issue = {
  error(sheet: string, rowNumber: number, code: ImportIssueCode, message?: string, column?: string, rawValue?: string): ImportIssueDraft {
    return { sheet, rowNumber, code, column, rawValue, severity: 'ERROR', message: message ?? IMPORT_CODES[code] };
  },
  warning(sheet: string, rowNumber: number, code: ImportIssueCode, message?: string, column?: string, rawValue?: string): ImportIssueDraft {
    return { sheet, rowNumber, code, column, rawValue, severity: 'WARNING', message: message ?? IMPORT_CODES[code] };
  },
};

/** Import options (spec 16.1 step 2) persisted on the job. */
export interface ImportOptions {
  /** What to do when article_no already exists in the same product. */
  onDuplicateArticleNo: 'UPDATE' | 'SKIP' | 'FAIL';
  createMissingBrands: boolean;
  publishStatus: 'DRAFT' | 'PUBLISHED';
  /** Images referenced by URL column are fetched during postProcess. */
  strictImages: boolean;
}

/** Wire schema for the options (validated at upload time). */
export const ImportOptionsSchema = z.object({
  onDuplicateArticleNo: z.enum(['UPDATE', 'SKIP', 'FAIL']),
  createMissingBrands: z.boolean(),
  publishStatus: z.enum(['DRAFT', 'PUBLISHED']),
  strictImages: z.boolean(),
});

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  onDuplicateArticleNo: 'UPDATE',
  createMissingBrands: false,
  publishStatus: 'DRAFT',
  strictImages: false,
};
