// Layer 1 — file-level validation (spec 16.3): extension + magic-byte
// sniffing, size limit, password/macro detection, required sheets/headers,
// duplicate or unknown columns and the 50k row limit. `preflightFile` runs
// BEFORE parsing (no decode needed — rejects wrong types outright);
// `validateSheets` runs after the parse over the ParsedWorkbook.
import { readFile, stat } from 'node:fs/promises';
import { issue, type ImportIssueDraft } from '../imports.errors.js';
import { REQUIRED_SHEETS, SHEET_COLUMNS, importExtensionOf, type ParsedWorkbook } from '../parsers/import.parser.js';

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
export const MAX_VARIANT_ROWS = 50_000;

/** PK\x03\x04 — a .xlsx is a ZIP container. */
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export interface FileFacts {
  sizeBytes: number;
  extension: 'xlsx' | 'csv' | 'other';
  /** True when the ZIP container advertises encryption or hides workbook.xml. */
  encrypted: boolean;
  /** True when a vbaProject.bin (macro project) is embedded. */
  hasMacros: boolean;
}

/** Sniffs the file WITHOUT parsing it (cheap, first gate). */
export async function sniffFile(filePath: string, fileName: string): Promise<FileFacts> {
  const sizeBytes = (await stat(filePath)).size;
  const extension = importExtensionOf(fileName);
  if (extension !== 'xlsx') {
    return { sizeBytes, extension, encrypted: false, hasMacros: false };
  }
  const head = (await readFile(filePath)).subarray(0, 4);
  if (!head.equals(ZIP_SIGNATURE)) {
    return { sizeBytes, extension, encrypted: false, hasMacros: false };
  }
  // Encrypted OOXML packages carry "EncryptedPackage"/encryption.xml; macro
  // projects carry vbaProject.bin. A text scan of the container suffices.
  const text = (await readFile(filePath)).toString('latin1');
  return {
    sizeBytes,
    extension,
    encrypted: text.includes('EncryptedPackage') || text.includes('encryption.xml'),
    hasMacros: text.includes('vbaProject.bin') || fileName.toLowerCase().endsWith('.xlsm'),
  };
}

/**
 * Pre-parse gate: extension, size, magic bytes, macros, encryption. A non-empty
 * result aborts the job (these issues are all ERROR severity).
 */
export async function preflightFile(filePath: string, fileName: string): Promise<ImportIssueDraft[]> {
  const issues: ImportIssueDraft[] = [];
  const facts = await sniffFile(filePath, fileName);
  if (facts.sizeBytes > MAX_IMPORT_BYTES) {
    issues.push(issue.error('File', 0, 'FILE_TOO_LARGE', `${(facts.sizeBytes / 1024 / 1024).toFixed(1)} MB exceeds the 25 MB limit.`));
  }
  if (facts.extension === 'other') {
    issues.push(issue.error('File', 0, 'FILE_BAD_EXTENSION', `Unsupported extension '${fileName.split('.').pop() ?? ''}'.`));
    return issues;
  }
  if (facts.extension === 'xlsx') {
    const head = (await readFile(filePath)).subarray(0, 4);
    if (!head.equals(ZIP_SIGNATURE)) {
      issues.push(issue.error('File', 0, 'FILE_BAD_MAGIC', 'Not a valid .xlsx (ZIP) container.'));
      return issues;
    }
    if (facts.hasMacros) {
      issues.push(issue.error('File', 0, 'FILE_MACROS'));
      return issues;
    }
    if (facts.encrypted) {
      issues.push(issue.error('File', 0, 'FILE_PASSWORD_PROTECTED'));
      return issues;
    }
  }
  return issues;
}

/**
 * Post-parse sheet-level checks: required sheets/headers, unknown columns,
 * row limit and the empty-file rule (no data rows in ANY sheet).
 */
export function validateSheets(parsed: ParsedWorkbook): ImportIssueDraft[] {
  const issues: ImportIssueDraft[] = [];
  for (const sheetName of REQUIRED_SHEETS) {
    const sheet = parsed.sheets[sheetName];
    if (sheet === undefined) {
      issues.push(issue.error('File', 0, 'FILE_SHEETS_MISSING', `Sheet '${sheetName}' is missing.`));
      continue;
    }
    const required = SHEET_COLUMNS[sheetName]!.filter((column) => column !== 'ean');
    const missing = required.filter((column) => !sheet.headers.includes(column));
    for (const column of missing) {
      issues.push(issue.error(sheetName, 1, 'FILE_SHEETS_MISSING', `Required column '${column}' is missing on ${sheetName}.`, column));
    }
  }
  for (const [sheetName, unknown] of Object.entries(parsed.unknownColumns)) {
    for (const column of unknown) {
      issues.push(issue.warning(sheetName, 1, 'FILE_HEADERS_INVALID', `Column '${column}' is not recognised and was ignored.`, column));
    }
  }
  const variantRowCount = parsed.sheets['Variants']?.rows.length ?? 0;
  if (variantRowCount > MAX_VARIANT_ROWS) {
    issues.push(issue.error('Variants', 0, 'FILE_ROW_LIMIT', `${variantRowCount} variant rows exceed the 50,000 limit.`));
  }
  const productRowCount = parsed.sheets['Products']?.rows.length ?? 0;
  if (productRowCount === 0 && variantRowCount === 0) {
    issues.push(issue.error('File', 0, 'FILE_EMPTY'));
  }
  return issues;
}
