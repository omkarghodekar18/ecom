// Parser layer (spec 16.4): turns an uploaded .xlsx or .csv into the common
// `ParsedWorkbook` shape with NORMALIZED headers (lowercase, underscores,
// alias-mapped). xlsx parsing uses the exceljs streaming WorkbookReader so
// memory stays bounded for 25 MB / 50k-row files; formula cells are detected
// and only their CACHED value is read (evaluating formulas is unsafe).
import { createHash } from 'node:crypto';
import { logger } from '../../../config/logger.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

export interface ParsedCell {
  /** Stringified cell value ('' when empty). */
  raw: string;
  /** True when the cell held a formula (reported as a warning upstream). */
  formula: boolean;
}

export interface ParsedSheet {
  /** Normalized header keys present on the sheet. */
  headers: string[];
  rows: Array<{ rowNumber: number; cells: Record<string, ParsedCell> }>;
}

export interface ParsedWorkbook {
  /** Sheet name → parsed rows (only the known sheets, in file order). */
  sheets: Record<string, ParsedSheet>;
  /** Headers that matched no known column (reported by the file validator). */
  unknownColumns: Record<string, string[]>;
  /** Count of formula cells seen (informational). */
  formulaCellCount: number;
}

/** Column aliases (spec 16.3: "case/space-insensitive aliases"). */
const ALIASES: Record<string, string> = {
  productkey: 'product_key',
  'product key': 'product_key',
  name: 'name',
  product_name: 'name',
  brand: 'brand',
  brand_name: 'brand',
  category: 'category_code',
  category_code: 'category_code',
  'category code': 'category_code',
  short_description: 'short_description',
  'short description': 'short_description',
  description: 'description_html',
  description_html: 'description_html',
  html: 'description_html',
  bestseller: 'is_bestseller',
  is_bestseller: 'is_bestseller',
  isbestseller: 'is_bestseller',
  status: 'status',
  seo_title: 'seo_title',
  'seo title': 'seo_title',
  seo_description: 'seo_description',
  'seo description': 'seo_description',
  article_no: 'article_no',
  'article no': 'article_no',
  articleno: 'article_no',
  article: 'article_no',
  ean: 'ean',
  ean13: 'ean',
  gtin: 'ean',
  list_price: 'list_price',
  'list price': 'list_price',
  price: 'list_price',
  currency: 'currency',
  price_unit: 'price_unit',
  unit: 'price_unit',
  unit_label: 'unit_label',
  'unit label': 'unit_label',
  stock: 'stock_qty',
  stock_qty: 'stock_qty',
  quantity: 'stock_qty',
  lead_time_min_days: 'lead_time_min_days',
  lead_time_min: 'lead_time_min_days',
  lead_time_max_days: 'lead_time_max_days',
  lead_time_max: 'lead_time_max_days',
  min_order_qty: 'min_order_qty',
  'min order qty': 'min_order_qty',
  minimum_order_quantity: 'min_order_qty',
  pack_size: 'pack_size',
  packsize: 'pack_size',
  active: 'is_active',
  is_active: 'is_active',
  image_url: 'image_url',
  'image url': 'image_url',
  url: 'image_url',
  zip_filename: 'zip_filename',
  kind: 'kind',
  alt: 'alt',
  sort_order: 'sort_order',
  title: 'title',
  min_qty: 'min_qty',
  customer_number: 'customer_number',
  'customer number': 'customer_number',
  valid_from: 'valid_from',
  valid_to: 'valid_to',
};

/**
 * Normalizes a header cell: trim, lowercase, collapse spaces, map alias.
 * `sheetName` disambiguates columns whose bare name means different things
 * per sheet: 'price' is list_price on Variants (and the flat CSV) but stays
 * 'price' on PriceTiers/CustomerPrices; 'url' is image_url only on Images.
 */
export function normalizeHeader(header: string, sheetName?: string): string | null {
  const collapsed = header.trim().toLowerCase().replace(/\s+/g, ' ');
  if (collapsed === '') return null;
  const ambiguous = new Map([
    ['price', sheetName === undefined || sheetName === 'Variants' ? 'list_price' : 'price'],
    ['url', sheetName === undefined || sheetName === 'Images' ? 'image_url' : 'url'],
  ]);
  if (sheetName !== undefined && ambiguous.has(collapsed)) return ambiguous.get(collapsed) ?? null;
  if (ALIASES[collapsed] !== undefined) return ALIASES[collapsed] ?? null;
  if (ALIASES[collapsed.replace(/ /g, '_')] !== undefined) return ALIASES[collapsed.replace(/ /g, '_')] ?? null;
  if (collapsed.startsWith('attr:')) return collapsed.replace(/\s+/g, ''); // attr:<key> kept verbatim
  return collapsed.replace(/ /g, '_');
}

/** The canonical column sets per sheet (attr:* columns are dynamic). */
export const SHEET_COLUMNS: Record<string, string[]> = {
  Products: ['product_key', 'name', 'brand', 'category_code', 'short_description', 'description_html', 'is_bestseller', 'status', 'seo_title', 'seo_description'],
  Variants: ['product_key', 'article_no', 'ean', 'list_price', 'currency', 'price_unit', 'unit_label', 'stock_qty', 'lead_time_min_days', 'lead_time_max_days', 'min_order_qty', 'pack_size', 'is_active'],
  Images: ['article_no', 'product_key', 'image_url', 'zip_filename', 'kind', 'alt', 'sort_order'],
  Documents: ['product_key', 'kind', 'title', 'url'],
  PriceTiers: ['article_no', 'min_qty', 'price'],
  CustomerPrices: ['customer_number', 'article_no', 'price', 'valid_from', 'valid_to'],
};

export const REQUIRED_SHEETS = ['Products', 'Variants'] as const;

function cellToString(value: ExcelJS.CellValue): { raw: string; formula: boolean } {
  if (value === null || value === undefined) return { raw: '', formula: false };
  if (typeof value === 'object' || (value as unknown) instanceof Date) {
    if (value instanceof Date) return { raw: value.toISOString().slice(0, 10), formula: false };
    const objectValue = value as { formula?: unknown; result?: unknown; text?: unknown; richText?: Array<{ text: string }>; hyperlink?: unknown; error?: unknown };
    if (objectValue.formula !== undefined || objectValue.error !== undefined) {
      // Formula cell: use the cached result only.
      const result = objectValue.result;
      return { raw: result === null || result === undefined ? '' : String(result), formula: true };
    }
    if (Array.isArray(objectValue.richText)) {
      return { raw: objectValue.richText.map((part) => part.text).join(''), formula: false };
    }
    if (objectValue.text !== undefined) return { raw: String(objectValue.text), formula: false };
    if (objectValue.hyperlink !== undefined) return { raw: String(objectValue.hyperlink), formula: false };
    return { raw: '', formula: false };
  }
  return { raw: String(value), formula: false };
}

/** Streaming .xlsx parse. `onProgress` is called per sheet for UI progress.
 * The streaming reader is the primary path (bounded memory); workbooks whose
 * zip entry order it cannot handle (e.g. re-saved by other libraries) fall
 * back to a buffered load — acceptable because preflight already capped the
 * file at 25 MB / 50k rows. */
export async function parseXlsx(
  filePath: string,
  onProgress?: (sheetName: string, rows: number) => void,
): Promise<ParsedWorkbook> {
  try {
    return await parseXlsxStreaming(filePath, onProgress);
  } catch (streamError) {
    logger.warn({ err: streamError }, 'imports: streaming xlsx parse failed — falling back to buffered parse');
    return parseXlsxBuffered(filePath, onProgress);
  }
}

async function parseXlsxStreaming(
  filePath: string,
  onProgress?: (sheetName: string, rows: number) => void,
): Promise<ParsedWorkbook> {
  const workbook: ParsedWorkbook = { sheets: {}, unknownColumns: {}, formulaCellCount: 0 };
  const stream = (await import('node:fs')).createReadStream(filePath);
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(stream, {
    sharedStrings: 'cache',
    styles: 'ignore',
    hyperlinks: 'ignore',
    worksheets: 'emit',
  } as ConstructorParameters<typeof ExcelJS.stream.xlsx.WorkbookReader>[1]);

  for await (const sheet of reader) {
    const name = String((sheet as unknown as { name?: string; id?: number }).name ?? (sheet as unknown as { id?: number }).id ?? 'Sheet');
    let rowIndex = 0;
    const headers: string[] = [];
    const headerSeen = new Set<string>();
    const unknown = new Set<string>();
    const rows: ParsedSheet['rows'] = [];
    for await (const row of sheet) {
      rowIndex += 1;
      if (rowIndex === 1) {
        // Header row: normalize every non-empty cell; note duplicates.
        for (const cell of (row.values as ExcelJS.CellValue[]).slice(1)) {
          const normalized = normalizeHeader(cellToString(cell).raw, name);
          if (normalized === null) continue;
          if (headerSeen.has(normalized)) continue; // duplicate column → reported later
          headerSeen.add(normalized);
          headers.push(normalized);
        }
        for (const header of headers) {
          if (!header.startsWith('attr:') && !(SHEET_COLUMNS[name] ?? []).includes(header)) {
            unknown.add(header);
          }
        }
        continue;
      }
      const cells: Record<string, ParsedCell> = {};
      const values = row.values as ExcelJS.CellValue[];
      headers.forEach((header, index) => {
        const parsedCell = cellToString(values[index + 1] ?? null);
        if (parsedCell.formula) workbook.formulaCellCount += 1;
        cells[header] = parsedCell;
      });
      const hasData = Object.values(cells).some((cell) => cell.raw.trim() !== '');
      if (hasData) rows.push({ rowNumber: rowIndex, cells });
    }
    workbook.sheets[name] = { headers, rows };
    if (unknown.size > 0 && name !== 'README') workbook.unknownColumns[name] = [...unknown];
    onProgress?.(name, rows.length);
  }
  return workbook;
}

/** Buffered fallback: same normalization rules, whole-workbook load. */
async function parseXlsxBuffered(
  filePath: string,
  onProgress?: (sheetName: string, rows: number) => void,
): Promise<ParsedWorkbook> {
  const workbook: ParsedWorkbook = { sheets: {}, unknownColumns: {}, formulaCellCount: 0 };
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.readFile(filePath);
  loaded.eachSheet((sheet) => {
    const name = sheet.name;
    const headers: string[] = [];
    const headerSeen = new Set<string>();
    const unknown = new Set<string>();
    const rows: ParsedSheet['rows'] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) {
        (row.values as ExcelJS.CellValue[]).slice(1).forEach((cell) => {
          const normalized = normalizeHeader(cellToString(cell).raw, name);
          if (normalized === null) return;
          if (headerSeen.has(normalized)) return;
          headerSeen.add(normalized);
          headers.push(normalized);
        });
        for (const header of headers) {
          if (!header.startsWith('attr:') && !(SHEET_COLUMNS[name] ?? []).includes(header)) {
            unknown.add(header);
          }
        }
        return;
      }
      const cells: Record<string, ParsedCell> = {};
      headers.forEach((header, index) => {
        const parsedCell = cellToString((row.values as ExcelJS.CellValue[])[index + 1] ?? null);
        if (parsedCell.formula) workbook.formulaCellCount += 1;
        cells[header] = parsedCell;
      });
      const hasData = Object.values(cells).some((cell) => cell.raw.trim() !== '');
      if (hasData) rows.push({ rowNumber, cells });
    });
    workbook.sheets[name] = { headers, rows };
    if (unknown.size > 0 && name !== 'README') workbook.unknownColumns[name] = [...unknown];
    onProgress?.(name, rows.length);
  });
  return workbook;
}

/** SHA-256 of the uploaded file (idempotency key + audit trail). */
export async function sha256File(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * CSV parse (spec 16.2 note): a single flat Variants-style file. Product
 * columns ride along and are grouped by product_key. UTF-8 (BOM allowed) is
 * verified before parsing. Returns the SAME ParsedWorkbook shape with virtual
 * Products/Variants sheets so downstream layers stay format-agnostic.
 */
export async function parseCsv(filePath: string): Promise<ParsedWorkbook> {
  const buffer = await readFile(filePath);
  const withoutBom = buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf ? buffer.subarray(3) : buffer;
  const text = withoutBom.toString('utf8');
  // Strict UTF-8 check: re-encode must round-trip (rejects latin-1 etc.).
  if (Buffer.compare(Buffer.from(text, 'utf8'), withoutBom) !== 0) {
    const error = new Error('CSV_ENCODING') as Error & { code?: string };
    error.code = 'FILE_ENCODING';
    throw error;
  }
  const records = parseCsvText(text);
  if (records.length === 0) {
    const error = new Error('FILE_EMPTY') as Error & { code?: string };
    error.code = 'FILE_EMPTY';
    throw error;
  }
  const headers = records[0]!.map((header) => normalizeHeader(header)!).filter((header) => header !== null);
  const dataRows = records.slice(1).filter((fields) => fields.some((field) => field.trim() !== ''));

  const productHeaders = SHEET_COLUMNS['Products'] ?? [];
  const variantHeaders = SHEET_COLUMNS['Variants'] ?? [];
  const attrHeaders = headers.filter((header) => header.startsWith('attr:'));

  // Group by product_key: product fields from the FIRST row of each group.
  const productRows = new Map<string, { rowNumber: number; cells: Record<string, ParsedCell> }>();
  const variantRows: ParsedSheet['rows'] = [];
  const seenIn = new Set<string>();
  dataRows.forEach((fields, index) => {
    const cells: Record<string, ParsedCell> = {};
    headers.forEach((header, columnIndex) => {
      cells[header] = { raw: fields[columnIndex] ?? '', formula: false };
    });
    const rowNumber = index + 2; // account for the header line
    const key = cells['product_key']?.raw.trim() ?? '';
    if (key !== '' && !productRows.has(key)) {
      const productCells: Record<string, ParsedCell> = {};
      for (const header of [...productHeaders, ...attrHeaders]) {
        if (cells[header] !== undefined) productCells[header] = cells[header]!;
      }
      productRows.set(key, { rowNumber, cells: productCells });
    }
    const variantCells: Record<string, ParsedCell> = {};
    for (const header of [...variantHeaders, ...attrHeaders]) {
      if (cells[header] !== undefined) variantCells[header] = cells[header]!;
    }
    if (key !== '' && seenIn.has(key) === false) seenIn.add(key);
    variantRows.push({ rowNumber, cells: variantCells });
  });

  const unknown = headers.filter(
    (header) =>
      !header.startsWith('attr:') &&
      !productHeaders.includes(header) &&
      !variantHeaders.includes(header) &&
      header !== 'image_url' &&
      header !== 'zip_filename' &&
      header !== 'kind' &&
      header !== 'alt' &&
      header !== 'sort_order' &&
      header !== 'title' &&
      header !== 'min_qty' &&
      header !== 'customer_number' &&
      header !== 'valid_from' &&
      header !== 'valid_to' &&
      header !== 'url',
  );

  return {
    sheets: {
      Products: { headers: [...productHeaders, ...attrHeaders], rows: [...productRows.values()] },
      Variants: { headers: [...variantHeaders, ...attrHeaders], rows: variantRows },
      ...(dataRows.some((_, index) => headers.includes('image_url') && records[index + 1]?.some((f) => f !== ''))
        ? {}
        : {}),
    },
    unknownColumns: unknown.length > 0 ? { CSV: unknown } : {},
    formulaCellCount: 0,
  };
}

/** Minimal RFC-4180 CSV state machine (quotes, escaped quotes, CRLF). */
export function parseCsvText(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      record.push(field);
      field = '';
      if (record.some((value) => value !== '')) records.push(record);
      record = [];
    } else {
      field += char;
    }
  }
  record.push(field);
  if (record.some((value) => value !== '')) records.push(record);
  return records;
}

/** File extension check shared by the upload endpoint and the file validator. */
export function importExtensionOf(fileName: string): 'xlsx' | 'csv' | 'other' {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === '.xlsx') return 'xlsx';
  if (extension === '.csv') return 'csv';
  return 'other';
}
