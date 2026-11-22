// Schema layer (spec 16.3 layer 2): cell-level validation + normalisation per
// sheet. Every check reports an issue instead of throwing so one pass collects
// ALL problems for the report. Normalized rows feed the referential/business
// layers and (after planning) the committer.
import { isValidGtin } from '../../../common/utils/gtin.util.js';
import { sanitizePlainOrHtml } from '../../../common/utils/html-sanitize.util.js';
import { IMPORT_CODES, issue, type ImportIssueDraft, type ImportOptions } from '../imports.errors.js';
import type { ParsedSheet } from '../parsers/import.parser.js';

export interface NormalizedProductRow {
  rowNumber: number;
  productKey: string;
  name: string;
  brand: string;
  categoryCode: string;
  shortDescription: string | null;
  descriptionHtml: string | null;
  isBestseller: boolean;
  status: 'DRAFT' | 'PUBLISHED';
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface NormalizedVariantRow {
  rowNumber: number;
  productKey: string;
  articleNo: string;
  ean: string | null;
  listPrice: string;
  currency: string;
  priceUnit: number;
  unitLabel: string;
  stockQty: number;
  leadTimeMinDays: number | null;
  leadTimeMaxDays: number | null;
  minOrderQty: number;
  packSize: number;
  isActive: boolean;
  attributes: Record<string, string>;
}

export interface NormalizedImageRow {
  rowNumber: number;
  articleNo: string | null;
  productKey: string | null;
  imageUrl: string | null;
  zipFilename: string | null;
  kind: string;
  alt: string | null;
  sortOrder: number;
}

export interface NormalizedDocumentRow {
  rowNumber: number;
  productKey: string;
  kind: string;
  title: string;
  url: string;
}

export interface NormalizedTierRow {
  rowNumber: number;
  articleNo: string;
  minQty: number;
  price: string;
}

export interface NormalizedCustomerPriceRow {
  rowNumber: number;
  customerNumber: string;
  articleNo: string;
  price: string;
  validFrom: string | null;
  validTo: string | null;
}

export interface NormalizedWorkbook {
  products: NormalizedProductRow[];
  variants: NormalizedVariantRow[];
  images: NormalizedImageRow[];
  documents: NormalizedDocumentRow[];
  priceTiers: NormalizedTierRow[];
  customerPrices: NormalizedCustomerPriceRow[];
}

// Comma included: seeded article numbers use the DIN style "111100 0,5".
const ARTICLE_NO_REGEX = /^[A-Za-z0-9][A-Za-z0-9 .,/\\-]{0,39}$/;
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
const DOC_EXTENSIONS = ['.pdf', '.doc', '.docx', '.zip', '.xls', '.xlsx'];

/** Default image host allow-list (spec 16.3 layer 2). */
export const IMAGE_DOMAIN_ALLOWLIST = (process.env.IMPORT_IMAGE_DOMAINS ?? 'res.cloudinary.com,upload.wikimedia.org').split(',').map((domain) => domain.trim().toLowerCase());

function trimmed(sheet: ParsedSheet, row: { rowNumber: number; cells: Record<string, { raw: string }> }, column: string): string {
  return (row.cells[column]?.raw ?? '').trim();
}

/**
 * Parses "1.234,56" / "1234.56" / "1,234.56" / "1234,56". Unambiguous rules:
 * both separators present → error; single ',' with exactly 2 trailing digits
 * → decimal comma; otherwise '.' is the decimal point.
 */
export function parsePrice(
  sheet: string,
  rowNumber: number,
  column: string,
  raw: string,
): { value: string | null; issues: ImportIssueDraft[] } {
  const issues: ImportIssueDraft[] = [];
  const text = raw.trim();
  if (text === '') return { value: null, issues };
  const hasDot = text.includes('.');
  const hasComma = text.includes(',');
  let normalized = text;
  if (hasDot && hasComma) {
    // "1,234.56" (US) or "1.234,56" (EU): the LAST separator is the decimal.
    const lastDot = text.lastIndexOf('.');
    const lastComma = text.lastIndexOf(',');
    const decimalSeparator = lastDot > lastComma ? '.' : ',';
    const thousands = decimalSeparator === '.' ? ',' : '.';
    normalized = text.split(thousands).join('');
    if (decimalSeparator === ',') normalized = normalized.replace(',', '.');
    // Only unambiguous when exactly one decimal separator remains.
    if (normalized.includes(',') || (normalized.match(/\./g) ?? []).length > 1) {
      issues.push(issue.error(sheet, rowNumber, 'PRICE_SEPARATORS', undefined, column, raw));
      return { value: null, issues };
    }
  } else if (hasComma) {
    const parts = text.split(',');
    if (parts.length > 2) {
      issues.push(issue.error(sheet, rowNumber, 'PRICE_SEPARATORS', undefined, column, raw));
      return { value: null, issues };
    }
    normalized = text.replace(',', '.');
  } else if (hasDot && (text.match(/\./g) ?? []).length > 1) {
    // '1.2.3' / '1.234.567': several dots and no comma — ambiguous grouping.
    issues.push(issue.error(sheet, rowNumber, 'PRICE_SEPARATORS', undefined, column, raw));
    return { value: null, issues };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    issues.push(issue.error(sheet, rowNumber, 'PRICE_INVALID', undefined, column, raw));
    return { value: null, issues };
  }
  const value = Number(normalized);
  if (!(value > 0)) {
    issues.push(issue.error(sheet, rowNumber, 'PRICE_INVALID', 'Price must be positive.', column, raw));
    return { value: null, issues };
  }
  return { value: value.toFixed(2), issues };
}

function parseBool(sheet: string, rowNumber: number, column: string, raw: string, fallback: boolean): { value: boolean | null; issues: ImportIssueDraft[] } {
  const text = raw.trim().toLowerCase();
  if (text === '') return { value: fallback, issues: [] };
  if (['true', 'yes', '1'].includes(text)) return { value: true, issues: [] };
  if (['false', 'no', '0'].includes(text)) return { value: false, issues: [] };
  return { value: null, issues: [issue.error(sheet, rowNumber, 'BOOL_INVALID', undefined, column, raw)] };
}

function parseIntCell(sheet: string, rowNumber: number, column: string, raw: string, fallback: number): { value: number | null; issues: ImportIssueDraft[] } {
  const text = raw.trim();
  if (text === '') return { value: fallback, issues: [] };
  if (!/^\d+$/.test(text)) {
    return { value: null, issues: [issue.error(sheet, rowNumber, 'INT_INVALID', undefined, column, raw)] };
  }
  return { value: Number(text), issues: [] };
}

function parseNullableInt(sheet: string, rowNumber: number, column: string, raw: string): { value: number | null; issues: ImportIssueDraft[] } {
  const text = raw.trim();
  if (text === '') return { value: null, issues: [] };
  if (!/^\d+$/.test(text)) {
    return { value: null, issues: [issue.error(sheet, rowNumber, 'INT_INVALID', undefined, column, raw)] };
  }
  return { value: Number(text), issues: [] };
}

/** Article numbers: trim + collapse inner whitespace; regex-checked. */
export function normalizeArticleNo(raw: string): string | null {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (collapsed === '') return null;
  return ARTICLE_NO_REGEX.test(collapsed) ? collapsed : null;
}

function parseHttpsUrl(
  sheet: string,
  rowNumber: number,
  column: string,
  raw: string,
  options: { extensions: string[]; domainCheck: boolean },
): { value: string | null; issues: ImportIssueDraft[] } {
  const text = raw.trim();
  if (text === '') return { value: null, issues: [] };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { value: null, issues: [issue.error(sheet, rowNumber, 'URL_NOT_HTTPS', 'Not a valid URL.', column, raw)] };
  }
  if (url.protocol !== 'https:') {
    return { value: null, issues: [issue.error(sheet, rowNumber, 'URL_NOT_HTTPS', undefined, column, raw)] };
  }
  const extension = (url.pathname.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
  if (options.extensions.length > 0 && extension !== '' && !options.extensions.includes(extension)) {
    return { value: null, issues: [issue.error(sheet, rowNumber, 'URL_EXTENSION', undefined, column, raw)] };
  }
  if (options.domainCheck && !IMAGE_DOMAIN_ALLOWLIST.includes(url.hostname.toLowerCase())) {
    return { value: null, issues: [issue.error(sheet, rowNumber, 'URL_DOMAIN', undefined, column, raw)] };
  }
  return { value: text, issues: [] };
}

function parseDate(sheet: string, rowNumber: number, column: string, raw: string): { value: string | null; issues: ImportIssueDraft[] } {
  const text = raw.trim();
  if (text === '') return { value: null, issues: [] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) {
    return { value: null, issues: [issue.error(sheet, rowNumber, 'DATE_INVALID', undefined, column, raw)] };
  }
  return { value: text, issues: [] };
}

/**
 * Layer-2 pass over one parsed workbook: emits issues and produces the
 * normalized row sets. Rows with ERROR-level schema problems are still
 * normalized as far as possible (null for the broken field) so later layers
 * can report additional context; the committer refuses to run with errors.
 */
export function validateAndNormalize(
  parsed: { sheets: Record<string, ParsedSheet>; formulaCellCount: number },
  options: ImportOptions,
): { normalized: NormalizedWorkbook; issues: ImportIssueDraft[] } {
  const issues: ImportIssueDraft[] = [];
  const products: NormalizedProductRow[] = [];
  const variants: NormalizedVariantRow[] = [];
  const images: NormalizedImageRow[] = [];
  const documents: NormalizedDocumentRow[] = [];
  const priceTiers: NormalizedTierRow[] = [];
  const customerPrices: NormalizedCustomerPriceRow[] = [];

  const productsSheet = parsed.sheets['Products'];
  if (productsSheet !== undefined) {
    for (const row of productsSheet.rows) {
      const productKey = trimmed(productsSheet, row, 'product_key');
      if (productKey === '') {
        issues.push(issue.error('Products', row.rowNumber, 'CELL_REQUIRED', 'product_key is required.', 'product_key'));
        continue;
      }
      const name = trimmed(productsSheet, row, 'name');
      if (name === '') issues.push(issue.error('Products', row.rowNumber, 'CELL_REQUIRED', 'name is required.', 'name'));
      if (name.length > 200) issues.push(issue.error('Products', row.rowNumber, 'CELL_MAX_LENGTH', undefined, 'name'));
      const brand = trimmed(productsSheet, row, 'brand');
      if (brand === '') issues.push(issue.error('Products', row.rowNumber, 'CELL_REQUIRED', 'brand is required.', 'brand'));
      const categoryCode = trimmed(productsSheet, row, 'category_code');
      if (categoryCode === '') issues.push(issue.error('Products', row.rowNumber, 'CELL_REQUIRED', 'category_code is required.', 'category_code'));

      const statusRaw = trimmed(productsSheet, row, 'status').toUpperCase();
      const status = statusRaw === '' ? options.publishStatus : statusRaw;
      if (status !== 'DRAFT' && status !== 'PUBLISHED') {
        issues.push(issue.error('Products', row.rowNumber, 'ENUM_INVALID', `status must be DRAFT or PUBLISHED (got '${statusRaw}').`, 'status', statusRaw));
      }

      const bestseller = parseBool('Products', row.rowNumber, 'is_bestseller', trimmed(productsSheet, row, 'is_bestseller'), false);
      issues.push(...bestseller.issues);

      const descriptionRaw = trimmed(productsSheet, row, 'description_html');
      let descriptionHtml: string | null = null;
      if (descriptionRaw !== '') {
        const sanitized = sanitizePlainOrHtml(descriptionRaw);
        descriptionHtml = sanitized.clean;
        if (sanitized.changed) {
          issues.push(issue.warning('Products', row.rowNumber, 'HTML_SANITIZED', undefined, 'description_html'));
        }
      }
      const shortDescription = trimmed(productsSheet, row, 'short_description');
      products.push({
        rowNumber: row.rowNumber,
        productKey,
        name: name.slice(0, 200),
        brand,
        categoryCode,
        shortDescription: shortDescription === '' ? null : shortDescription.slice(0, 500),
        descriptionHtml,
        isBestseller: bestseller.value ?? false,
        status: status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
        seoTitle: (trimmed(productsSheet, row, 'seo_title') || null)?.slice(0, 300) ?? null,
        seoDescription: (trimmed(productsSheet, row, 'seo_description') || null)?.slice(0, 500) ?? null,
      });
    }
  }

  const variantsSheet = parsed.sheets['Variants'];
  if (variantsSheet !== undefined) {
    const attrColumns = variantsSheet.headers.filter((header) => header.startsWith('attr:'));
    for (const row of variantsSheet.rows) {
      const productKey = trimmed(variantsSheet, row, 'product_key');
      if (productKey === '') issues.push(issue.error('Variants', row.rowNumber, 'CELL_REQUIRED', 'product_key is required.', 'product_key'));
      const articleRaw = trimmed(variantsSheet, row, 'article_no');
      const articleNo = articleRaw === '' ? null : normalizeArticleNo(articleRaw);
      if (articleNo === null) {
        issues.push(
          articleRaw === ''
            ? issue.error('Variants', row.rowNumber, 'CELL_REQUIRED', 'article_no is required.', 'article_no')
            : issue.error('Variants', row.rowNumber, 'ARTICLE_NO_INVALID', undefined, 'article_no', articleRaw),
        );
      }
      const price = parsePrice('Variants', row.rowNumber, 'list_price', trimmed(variantsSheet, row, 'list_price'));
      issues.push(...price.issues);
      if (price.value === null) {
        issues.push(issue.error('Variants', row.rowNumber, 'CELL_REQUIRED', 'list_price is required.', 'list_price'));
      }
      const eanRaw = trimmed(variantsSheet, row, 'ean').replace(/\s+/g, '');
      if (eanRaw !== '' && !/^\d{8}|\d{12}|\d{13}|\d{14}$/.test(eanRaw)) {
        issues.push(issue.error('Variants', row.rowNumber, 'EAN_FORMAT', undefined, 'ean', eanRaw));
      } else if (eanRaw !== '' && !isValidGtin(eanRaw)) {
        issues.push(issue.error('Variants', row.rowNumber, 'EAN_CHECKSUM', undefined, 'ean', eanRaw));
      }
      const stock = parseIntCell('Variants', row.rowNumber, 'stock_qty', trimmed(variantsSheet, row, 'stock_qty'), 0);
      issues.push(...stock.issues);
      const priceUnit = parseIntCell('Variants', row.rowNumber, 'price_unit', trimmed(variantsSheet, row, 'price_unit'), 1);
      issues.push(...priceUnit.issues);
      const minQty = parseIntCell('Variants', row.rowNumber, 'min_order_qty', trimmed(variantsSheet, row, 'min_order_qty'), 1);
      issues.push(...minQty.issues);
      const pack = parseIntCell('Variants', row.rowNumber, 'pack_size', trimmed(variantsSheet, row, 'pack_size'), 1);
      issues.push(...pack.issues);
      const active = parseBool('Variants', row.rowNumber, 'is_active', trimmed(variantsSheet, row, 'is_active'), true);
      issues.push(...active.issues);
      const leadMin = parseNullableInt('Variants', row.rowNumber, 'lead_time_min_days', trimmed(variantsSheet, row, 'lead_time_min_days'));
      issues.push(...leadMin.issues);
      const leadMax = parseNullableInt('Variants', row.rowNumber, 'lead_time_max_days', trimmed(variantsSheet, row, 'lead_time_max_days'));
      issues.push(...leadMax.issues);

      const attributes: Record<string, string> = {};
      for (const column of attrColumns) {
        const value = trimmed(variantsSheet, row, column);
        if (value !== '') attributes[column.slice('attr:'.length)] = value;
      }
      variants.push({
        rowNumber: row.rowNumber,
        productKey,
        articleNo: articleNo ?? articleRaw,
        ean: eanRaw === '' ? null : eanRaw,
        listPrice: price.value ?? '0.00',
        currency: (trimmed(variantsSheet, row, 'currency') || 'INR').toUpperCase().slice(0, 3),
        priceUnit: priceUnit.value ?? 1,
        unitLabel: (trimmed(variantsSheet, row, 'unit_label') || 'Piece').slice(0, 40),
        stockQty: stock.value ?? 0,
        leadTimeMinDays: leadMin.value,
        leadTimeMaxDays: leadMax.value,
        minOrderQty: minQty.value ?? 1,
        packSize: pack.value ?? 1,
        isActive: active.value ?? true,
        attributes,
      });
    }
  }

  const imagesSheet = parsed.sheets['Images'];
  if (imagesSheet !== undefined) {
    for (const row of imagesSheet.rows) {
      const url = parseHttpsUrl('Images', row.rowNumber, 'image_url', trimmed(imagesSheet, row, 'image_url'), { extensions: IMAGE_EXTENSIONS, domainCheck: true });
      issues.push(...url.issues);
      const kind = trimmed(imagesSheet, row, 'kind').toUpperCase() || 'PHOTO';
      if (!['PHOTO', 'DIMENSION', 'APPLICATION', 'PACKAGING', 'VIDEO'].includes(kind)) {
        issues.push(issue.error('Images', row.rowNumber, 'ENUM_INVALID', `Unknown image kind '${kind}'.`, 'kind'));
      }
      const sortOrder = parseIntCell('Images', row.rowNumber, 'sort_order', trimmed(imagesSheet, row, 'sort_order'), 0);
      issues.push(...sortOrder.issues);
      images.push({
        rowNumber: row.rowNumber,
        articleNo: trimmed(imagesSheet, row, 'article_no') || null,
        productKey: trimmed(imagesSheet, row, 'product_key') || null,
        imageUrl: url.value,
        zipFilename: trimmed(imagesSheet, row, 'zip_filename') || null,
        kind,
        alt: trimmed(imagesSheet, row, 'alt') || null,
        sortOrder: sortOrder.value ?? 0,
      });
    }
  }

  const documentsSheet = parsed.sheets['Documents'];
  if (documentsSheet !== undefined) {
    for (const row of documentsSheet.rows) {
      const url = parseHttpsUrl('Documents', row.rowNumber, 'url', trimmed(documentsSheet, row, 'url'), { extensions: DOC_EXTENSIONS, domainCheck: false });
      issues.push(...url.issues);
      const kind = trimmed(documentsSheet, row, 'kind').toUpperCase() || 'DATASHEET';
      if (!['DATASHEET', 'MANUAL', 'CERTIFICATE', 'SAFETY', 'DRAWING'].includes(kind)) {
        issues.push(issue.error('Documents', row.rowNumber, 'ENUM_INVALID', `Unknown document kind '${kind}'.`, 'kind'));
      }
      documents.push({
        rowNumber: row.rowNumber,
        productKey: trimmed(documentsSheet, row, 'product_key'),
        kind,
        title: trimmed(documentsSheet, row, 'title'),
        url: url.value ?? trimmed(documentsSheet, row, 'url'),
      });
    }
  }

  const tiersSheet = parsed.sheets['PriceTiers'];
  if (tiersSheet !== undefined) {
    for (const row of tiersSheet.rows) {
      const price = parsePrice('PriceTiers', row.rowNumber, 'price', trimmed(tiersSheet, row, 'price'));
      issues.push(...price.issues);
      const minQty = parseIntCell('PriceTiers', row.rowNumber, 'min_qty', trimmed(tiersSheet, row, 'min_qty'), 1);
      issues.push(...minQty.issues);
      priceTiers.push({
        rowNumber: row.rowNumber,
        articleNo: trimmed(tiersSheet, row, 'article_no'),
        minQty: minQty.value ?? 1,
        price: price.value ?? '0.00',
      });
    }
  }

  const customerPricesSheet = parsed.sheets['CustomerPrices'];
  if (customerPricesSheet !== undefined) {
    for (const row of customerPricesSheet.rows) {
      const price = parsePrice('CustomerPrices', row.rowNumber, 'price', trimmed(customerPricesSheet, row, 'price'));
      issues.push(...price.issues);
      const validFrom = parseDate('CustomerPrices', row.rowNumber, 'valid_from', trimmed(customerPricesSheet, row, 'valid_from'));
      issues.push(...validFrom.issues);
      const validTo = parseDate('CustomerPrices', row.rowNumber, 'valid_to', trimmed(customerPricesSheet, row, 'valid_to'));
      issues.push(...validTo.issues);
      customerPrices.push({
        rowNumber: row.rowNumber,
        customerNumber: trimmed(customerPricesSheet, row, 'customer_number'),
        articleNo: trimmed(customerPricesSheet, row, 'article_no'),
        price: price.value ?? '0.00',
        validFrom: validFrom.value,
        validTo: validTo.value,
      });
    }
  }

  // Formula cells are never evaluated — the cached value was read; warn once.
  if (parsed.formulaCellCount > 0) {
    issues.push(
      issue.warning('Products', 1, 'FORMULA_CELL', `${parsed.formulaCellCount} formula cell(s) found — only cached values are imported.`),
    );
  }

  return { normalized: { products, variants, images, documents, priceTiers, customerPrices }, issues };
}

export { IMPORT_CODES };
