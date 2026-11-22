// Import validators unit suite (spec 16.3/21): every stable error code is
// exercised at least once through the pure layer functions (no DB). The
// referential/DB layers are covered by tests/integration/imports.test.ts.
import { describe, it, expect } from 'vitest';
import { parsePrice, validateAndNormalize, normalizeArticleNo } from '../../src/modules/imports/schemas/sheet.schemas.js';
import { parseCsvText } from '../../src/modules/imports/parsers/import.parser.js';
import { validateBusiness, MAX_IMAGES_PER_PRODUCT } from '../../src/modules/imports/validators/business.validator.js';
import { DEFAULT_IMPORT_OPTIONS } from '../../src/modules/imports/imports.errors.js';
import type { NormalizedWorkbook } from '../../src/modules/imports/schemas/sheet.schemas.js';

const OPTIONS = DEFAULT_IMPORT_OPTIONS;

function codes(issues: Array<{ code: string }>): string[] {
  return issues.map((item) => item.code);
}

function sheet(rows: Array<Record<string, string>>, headers?: string[]): { sheets: Record<string, { headers: string[]; rows: Array<{ rowNumber: number; cells: Record<string, { raw: string }> }> }>; formulaCellCount: number } {
  const headerList = headers ?? Object.keys(rows[0] ?? { product_key: '' });
  return {
    sheets: {
      Variants: {
        headers: headerList,
        rows: rows.map((cells, index) => ({ rowNumber: index + 2, cells: Object.fromEntries(Object.entries(cells).map(([key, value]) => [key, { raw: value }])) })),
      },
    },
    formulaCellCount: 0,
  };
}

describe('price parsing (PRICE_INVALID / PRICE_SEPARATORS)', () => {
  it('accepts unambiguous formats', () => {
    expect(parsePrice('S', 2, 'list_price', '1234.56')).toMatchObject({ value: '1234.56' });
    expect(parsePrice('S', 2, 'list_price', '1234,56')).toMatchObject({ value: '1234.56' });
    expect(parsePrice('S', 2, 'list_price', '1,234.56')).toMatchObject({ value: '1234.56' });
    expect(parsePrice('S', 2, 'list_price', '1.234,56')).toMatchObject({ value: '1234.56' });
  });

  it('rejects zero/negative/more than 2 dp (PRICE_INVALID)', () => {
    expect(codes(parsePrice('S', 2, 'p', '0').issues)).toContain('PRICE_INVALID');
    expect(codes(parsePrice('S', 2, 'p', '-5.00').issues)).toContain('PRICE_INVALID');
    expect(codes(parsePrice('S', 2, 'p', '1.234').issues)).toContain('PRICE_INVALID');
    expect(codes(parsePrice('S', 2, 'p', 'abc').issues)).toContain('PRICE_INVALID');
  });

  it('rejects ambiguous separators (PRICE_SEPARATORS)', () => {
    expect(codes(parsePrice('S', 2, 'p', '1.2.3').issues)).toContain('PRICE_SEPARATORS');
    expect(codes(parsePrice('S', 2, 'p', '1,2,3').issues)).toContain('PRICE_SEPARATORS');
    expect(codes(parsePrice('S', 2, 'p', '1.234.567').issues)).toContain('PRICE_SEPARATORS');
  });
});

describe('article numbers (ARTICLE_NO_INVALID)', () => {
  it('normalises whitespace and accepts the allowed charset', () => {
    expect(normalizeArticleNo('  111100   0,5 ')).toBe('111100 0,5');
    expect(normalizeArticleNo('AB-12/3.4 x')).toBe('AB-12/3.4 x'); // valid charset
    expect(normalizeArticleNo('bad!')).toBeNull();
    expect(normalizeArticleNo('')).toBeNull();
  });
});

describe('CSV state machine (FILE_ENCODING guard lives in parseCsv)', () => {
  it('parses quotes, escaped quotes and CRLF', () => {
    expect(parseCsvText('a,b,c\n"x,1",2,3\r\n"he said ""hi""",,\n')).toEqual([
      ['a', 'b', 'c'],
      ['x,1', '2', '3'],
      ['he said "hi"', '', ''],
    ]);
  });
});

describe('schema layer codes', () => {
  it('BOOL_INVALID', () => {
    const result = validateAndNormalize(sheet([{ product_key: 'k', article_no: 'A1', list_price: '1.00', is_active: 'maybe' }]), OPTIONS);
    expect(codes(result.issues)).toContain('BOOL_INVALID');
  });

  it('INT_INVALID', () => {
    const result = validateAndNormalize(sheet([{ product_key: 'k', article_no: 'A1', list_price: '1.00', stock_qty: 'ten' }]), OPTIONS);
    expect(codes(result.issues)).toContain('INT_INVALID');
  });

  it('CELL_REQUIRED for article_no and list_price', () => {
    const result = validateAndNormalize(sheet([{ product_key: 'k', article_no: '', list_price: '' }]), OPTIONS);
    expect(codes(result.issues)).toContain('CELL_REQUIRED');
  });

  it('EAN_FORMAT + EAN_CHECKSUM', () => {
    const format = validateAndNormalize(sheet([{ product_key: 'k', article_no: 'A1', list_price: '1.00', ean: '12AB' }]), OPTIONS);
    expect(codes(format.issues)).toContain('EAN_FORMAT');
    const checksum = validateAndNormalize(sheet([{ product_key: 'k', article_no: 'A1', list_price: '1.00', ean: '4006381333930' }]), OPTIONS);
    expect(codes(checksum.issues)).toContain('EAN_CHECKSUM');
  });

  it('URL_NOT_HTTPS + URL_EXTENSION on the Images sheet', () => {
    const parsed = {
      sheets: {
        Images: {
          headers: ['article_no', 'image_url', 'kind', 'alt', 'sort_order'],
          rows: [
            { rowNumber: 2, cells: { article_no: { raw: 'A1' }, image_url: { raw: 'http://res.cloudinary.com/a.png' }, kind: { raw: 'PHOTO' }, alt: { raw: '' }, sort_order: { raw: '0' } } },
            { rowNumber: 3, cells: { article_no: { raw: 'A2' }, image_url: { raw: 'https://res.cloudinary.com/a.exe' }, kind: { raw: 'PHOTO' }, alt: { raw: '' }, sort_order: { raw: '0' } } },
          ],
        },
      },
      formulaCellCount: 0,
    };
    const result = validateAndNormalize(parsed, OPTIONS);
    expect(codes(result.issues)).toContain('URL_NOT_HTTPS');
    expect(codes(result.issues)).toContain('URL_EXTENSION');
  });

  it('ENUM_INVALID on image kind, DATE_INVALID on customer prices', () => {
    const parsed = {
      sheets: {
        Images: {
          headers: ['article_no', 'kind'],
          rows: [{ rowNumber: 2, cells: { article_no: { raw: 'A1' }, kind: { raw: 'HOLOGRAM' } } }],
        },
        CustomerPrices: {
          headers: ['customer_number', 'article_no', 'price', 'valid_from', 'valid_to'],
          rows: [{ rowNumber: 2, cells: { customer_number: { raw: 'C1' }, article_no: { raw: 'A1' }, price: { raw: '1.00' }, valid_from: { raw: '31/12/2026' }, valid_to: { raw: '' } } }],
        },
      },
      formulaCellCount: 0,
    };
    const result = validateAndNormalize(parsed, OPTIONS);
    expect(codes(result.issues)).toContain('ENUM_INVALID');
    expect(codes(result.issues)).toContain('DATE_INVALID');
  });

  it('HTML_SANITIZED warning + FORMULA_CELL warning', () => {
    const parsed = {
      sheets: {
        Products: {
          headers: ['product_key', 'name', 'brand', 'category_code', 'description_html'],
          rows: [
            { rowNumber: 2, cells: { product_key: { raw: 'k' }, name: { raw: 'N' }, brand: { raw: 'B' }, category_code: { raw: '10-01-01-01-00' }, description_html: { raw: '<p onclick="x()">ok</p><script>alert(1)</script>' } } },
          ],
        },
      },
      formulaCellCount: 2,
    };
    const result = validateAndNormalize(parsed, OPTIONS);
    expect(codes(result.issues)).toContain('HTML_SANITIZED');
    expect(codes(result.issues)).toContain('FORMULA_CELL');
    expect(result.normalized.products[0]?.descriptionHtml).toBe('<p>ok</p>');
  });
});

describe('business layer codes (L5)', () => {
  const base: NormalizedWorkbook = {
    products: [],
    variants: [],
    images: [],
    documents: [],
    priceTiers: [],
    customerPrices: [],
  };

  it('LEAD_TIME_ORDER + MIN_QTY_PACK', () => {
    const issues = validateBusiness({
      ...base,
      variants: [
        { rowNumber: 2, productKey: 'k', articleNo: 'A1', ean: null, listPrice: '1.00', currency: 'INR', priceUnit: 1, unitLabel: 'Piece', stockQty: 1, leadTimeMinDays: 14, leadTimeMaxDays: 11, minOrderQty: 3, packSize: 5, isActive: true, attributes: {} },
      ],
    });
    expect(codes(issues)).toContain('LEAD_TIME_ORDER');
    expect(codes(issues)).toContain('MIN_QTY_PACK');
  });

  it('TIER_QUANTITY_ORDER + TIER_PRICE_ORDER', () => {
    const issues = validateBusiness({
      ...base,
      variants: [{ rowNumber: 2, productKey: 'k', articleNo: 'A1', ean: null, listPrice: '500.00', currency: 'INR', priceUnit: 1, unitLabel: 'Piece', stockQty: 1, leadTimeMinDays: null, leadTimeMaxDays: null, minOrderQty: 1, packSize: 1, isActive: true, attributes: {} }],
      priceTiers: [
        { rowNumber: 2, articleNo: 'A1', minQty: 10, price: '450.00' },
        { rowNumber: 3, articleNo: 'A1', minQty: 5, price: '460.00' },
        { rowNumber: 4, articleNo: 'A1', minQty: 20, price: '499.00' },
      ],
    });
    expect(codes(issues)).toContain('TIER_QUANTITY_ORDER');
    expect(codes(issues)).toContain('TIER_PRICE_ORDER');
  });

  it('CUSTOMER_PRICE_ABOVE_LIST (warning) + DATE_RANGE', () => {
    const issues = validateBusiness({
      ...base,
      variants: [{ rowNumber: 2, productKey: 'k', articleNo: 'A1', ean: null, listPrice: '100.00', currency: 'INR', priceUnit: 1, unitLabel: 'Piece', stockQty: 1, leadTimeMinDays: null, leadTimeMaxDays: null, minOrderQty: 1, packSize: 1, isActive: true, attributes: {} }],
      customerPrices: [
        { rowNumber: 2, customerNumber: 'C1', articleNo: 'A1', price: '150.00', validFrom: '2026-12-31', validTo: '2026-01-01' },
      ],
    });
    expect(codes(issues)).toContain('CUSTOMER_PRICE_ABOVE_LIST');
    expect(codes(issues)).toContain('DATE_RANGE');
  });

  it('IMAGE_COUNT_LIMIT + PUBLISHED_NO_VARIANT + PUBLISHED_NO_IMAGE', () => {
    const issues = validateBusiness({
      ...base,
      products: [
        { rowNumber: 2, productKey: 'k1', name: 'P', brand: 'B', categoryCode: '10-01-01-01-00', shortDescription: null, descriptionHtml: null, isBestseller: false, status: 'PUBLISHED', seoTitle: null, seoDescription: null },
        { rowNumber: 3, productKey: 'k2', name: 'Q', brand: 'B', categoryCode: '10-01-01-01-00', shortDescription: null, descriptionHtml: null, isBestseller: false, status: 'PUBLISHED', seoTitle: null, seoDescription: null },
      ],
      variants: [],
      images: Array.from({ length: MAX_IMAGES_PER_PRODUCT + 1 }, (_, index) => ({
        rowNumber: index + 2, articleNo: null, productKey: 'k1', imageUrl: null, zipFilename: null, kind: 'PHOTO', alt: null, sortOrder: index,
      })),
    });
    expect(codes(issues)).toContain('IMAGE_COUNT_LIMIT');
    expect(codes(issues)).toContain('PUBLISHED_NO_VARIANT');
    expect(codes(issues)).toContain('PUBLISHED_NO_IMAGE');
  });
});
