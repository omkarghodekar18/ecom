// Template generator (spec 16.1 step 1): server-side .xlsx template with a
// README sheet (rules + enumerations), data-validation dropdowns, header
// comments and one example row. Optionally pre-fills the category's dynamic
// attr:<key> columns for a chosen category.
import ExcelJS from 'exceljs';
import { catalogRepository } from '../../catalog/index.js';
import { attributesService } from '../../attributes/index.js';
import { SHEET_COLUMNS } from '../parsers/import.parser.js';

const EXAMPLE_PRODUCT = {
  product_key: 'my-new-drill-family',
  name: 'Centre drill HSS type A DIN 333',
  brand: 'Holexa',
  category_code: '10-01-01-01-00',
  short_description: 'Type A centre drill to DIN 333.',
  description_html: '<p>Type A centre drills to DIN 333 for centre holes up to 6.3 mm.</p>',
  is_bestseller: 'no',
  status: 'PUBLISHED',
  seo_title: 'Centre drill HSS type A — DIN 333',
  seo_description: 'Centre drills type A, HSS, DIN 333.',
};

/** exceljs typings hide `dataValidations` (runtime API) — narrow local type. */
type ValidatedSheet = ExcelJS.Worksheet & {
  dataValidations: { add(ref: string, rule: { type: string; allowBlank?: boolean; formulae: string[] }): void };
};

/** Builds the template workbook as a Buffer. */
export async function generateTemplate(categoryCode?: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ToolHub India';
  workbook.created = new Date();

  let attributeColumns: string[] = [];
  let enumValidations: Array<{ attrKey: string; values: string[] }> = [];
  if (categoryCode !== undefined && categoryCode !== '') {
    const category = await catalogRepository.findByCode(categoryCode);
    if (category !== null) {
      const mappings = await attributesService.effectiveMappingsForCategory(category);
      attributeColumns = mappings.map((mapping) => `attr:${mapping.key}`);
      enumValidations = mappings
        .filter((mapping) => mapping.type === 'ENUM' && mapping.enumValues !== null)
        .map((mapping) => ({ attrKey: mapping.key, values: mapping.enumValues! }));
    }
  }

  // ── README sheet ────────────────────────────────────────────────────────
  const readme = workbook.addWorksheet('README');
  readme.getColumn(1).width = 118;
  const readmeLines = [
    ['ToolHub India — bulk import template'],
    [''],
    ['HOW TO USE'],
    ['1. Fill the Products sheet (one row per product family; product_key is your own id, unique in this file).'],
    ['2. Fill the Variants sheet (one row per article; product_key must match a Products row or an existing product slug).'],
    ['3. Optional sheets: Images, Documents, PriceTiers, CustomerPrices.'],
    ['4. Upload in Admin → Import Center and run the DRY RUN first — it validates everything without writing.'],
    [''],
    ['RULES'],
    ['Booleans: yes/no/true/false/1/0 (case-insensitive).'],
    ['EAN: GTIN-8/12/13/14 with a valid checksum. Article numbers: letters, digits, space, dot, slash, dash.'],
    ['Prices: positive, ≤ 2 decimal places. Use 1234.56 or 1234,56 — never mix separators in one cell.'],
    ['lead_time_min_days must be ≤ lead_time_max_days; min_order_qty must be a multiple of pack_size.'],
    ['Image URLs must be https and on the allow-list with an image extension.'],
    ['Attribute columns use the attr:<attribute_key> prefix and must be mapped to the product\'s category.'],
    ['category_code must be an ACTIVE LEAF category (products cannot sit above children).'],
    ...(categoryCode !== undefined ? [[''], [`This template was generated for category ${categoryCode}; its attribute columns are pre-filled below.`]] : []),
  ];
  readmeLines.forEach((line) => readme.addRow(line));
  readme.getCell('A1').font = { bold: true, size: 14 };

  // ── Products sheet ──────────────────────────────────────────────────────
  const products = workbook.addWorksheet('Products');
  products.columns = SHEET_COLUMNS['Products']!.map((header) => ({ header, key: header, width: header.endsWith('_html') ? 40 : 24 }));
  products.getRow(1).font = { bold: true };
  products.addRow(EXAMPLE_PRODUCT);
  // Dropdowns: is_bestseller + status.
  (products as ValidatedSheet).dataValidations.add('G2:G1000', {
    type: 'list',
    allowBlank: true,
    formulae: ['"yes,no,true,false,1,0"'],
  });
  (products as ValidatedSheet).dataValidations.add('H2:H1000', {
    type: 'list',
    allowBlank: true,
    formulae: ['"DRAFT,PUBLISHED"'],
  });
  addHeaderComments(products, {
    product_key: 'Your own id for this family — used by the Variants sheet. Must be unique in this file.',
    status: 'DRAFT or PUBLISHED.',
    is_bestseller: 'yes/no — shows the bestseller badge.',
  });

  // ── Variants sheet ──────────────────────────────────────────────────────
  const variants = workbook.addWorksheet('Variants');
  const variantHeaders = [...SHEET_COLUMNS['Variants']!, ...attributeColumns];
  variants.columns = variantHeaders.map((header) => ({ header, key: header, width: 20 }));
  variants.getRow(1).font = { bold: true };
  variants.addRow({
    product_key: EXAMPLE_PRODUCT.product_key,
    article_no: '900100 1',
    ean: '4013254001014',
    list_price: '450.00',
    currency: 'INR',
    price_unit: 1,
    unit_label: 'Piece',
    stock_qty: 50,
    lead_time_min_days: null,
    lead_time_max_days: null,
    min_order_qty: 1,
    pack_size: 1,
    is_active: 'yes',
    ...(attributeColumns.length > 0
      ? Object.fromEntries(attributeColumns.map((column, index) => [column, enumValidations[index]?.values[0] ?? '1']))
      : {}),
  });
  const activeColumn = variantHeaders.indexOf('is_active') + 1;
  (variants as ValidatedSheet).dataValidations.add(`${columnLetter(activeColumn)}2:${columnLetter(activeColumn)}1000`, {
    type: 'list',
    allowBlank: true,
    formulae: ['"yes,no,true,false,1,0"'],
  });
  // Enum dropdowns for attribute columns.
  for (const { attrKey, values } of enumValidations) {
    const columnIndex = variantHeaders.indexOf(`attr:${attrKey}`) + 1;
    if (columnIndex === 0) continue;
    (variants as ValidatedSheet).dataValidations.add(`${columnLetter(columnIndex)}2:${columnLetter(columnIndex)}1000`, {
      type: 'list',
      allowBlank: true,
      formulae: [`"${values.join(',')}"`],
    });
  }
  addHeaderComments(variants, {
    article_no: 'Globally unique article number.',
    ean: 'GTIN-8/12/13/14 with valid checksum.',
    list_price: 'Positive, ≤ 2 decimals.',
  });

  // ── optional sheets (headers only) ──────────────────────────────────────
  for (const [sheetName, columns] of Object.entries(SHEET_COLUMNS)) {
    if (sheetName === 'Products' || sheetName === 'Variants') continue;
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = columns.map((header) => ({ header, key: header, width: 22 }));
    sheet.getRow(1).font = { bold: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function addHeaderComments(sheet: ExcelJS.Worksheet, comments: Record<string, string>): void {
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const comment = comments[String(cell.value)];
    if (comment !== undefined) {
      cell.note = comment;
    }
    void columnNumber;
  });
}

function columnLetter(index: number): string {
  let result = '';
  let value = index;
  while (value > 0) {
    const modulo = (value - 1) % 26;
    result = String.fromCharCode(65 + modulo) + result;
    value = Math.floor((value - modulo) / 26);
  }
  return result;
}
