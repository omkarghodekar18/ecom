// Import test fixtures (spec 16.4): writes valid.xlsx + one invalid-*.xlsx
// per error class into this directory. Run: npx tsx tests/fixtures/import/generate.ts
// The integration suite loads these files; regenerating is deterministic.
import ExcelJS from 'exceljs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { makeGtin13 } from '../../../prisma/seed/util.js';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const PRODUCT_HEADERS = ['product_key', 'name', 'brand', 'category_code', 'short_description', 'description_html', 'is_bestseller', 'status', 'seo_title', 'seo_description'];
const VARIANT_HEADERS = ['product_key', 'article_no', 'ean', 'list_price', 'currency', 'price_unit', 'unit_label', 'stock_qty', 'lead_time_min_days', 'lead_time_max_days', 'min_order_qty', 'pack_size', 'is_active', 'attr:cutter_diameter_nominal', 'attr:tool_material', 'attr:coating', 'attr:drilling_tool_type'];

interface VariantInput {
  product_key: string;
  article_no: string;
  ean?: string | null;
  list_price?: string;
  stock_qty?: number;
  lead_time_min_days?: number | null;
  lead_time_max_days?: number | null;
  min_order_qty?: number;
  pack_size?: number;
  is_active?: string;
  'attr:cutter_diameter_nominal'?: string;
  'attr:tool_material'?: string;
  'attr:coating'?: string;
  'attr:drilling_tool_type'?: string;
}

function variant(input: VariantInput): VariantInput {
  return {
    product_key: input.product_key,
    article_no: input.article_no,
    ean: input.ean === undefined ? makeGtin13(`9${input.article_no.replace(/\D/g, '')}`.padStart(12, '0')) : input.ean,
    list_price: input.list_price ?? '500.00',
    currency: 'INR',
    price_unit: 1,
    unit_label: 'Piece',
    stock_qty: input.stock_qty ?? 10,
    lead_time_min_days: input.lead_time_min_days ?? null,
    lead_time_max_days: input.lead_time_max_days ?? null,
    min_order_qty: input.min_order_qty ?? 1,
    pack_size: input.pack_size ?? 1,
    is_active: input.is_active ?? 'yes',
    'attr:cutter_diameter_nominal': input['attr:cutter_diameter_nominal'] ?? '2',
    'attr:tool_material': input['attr:tool_material'] ?? 'HSS',
    'attr:coating': input['attr:coating'] ?? 'uncoated',
    'attr:drilling_tool_type': input['attr:drilling_tool_type'] ?? 'centre drill type R',
    ...input,
  };
}

function product(key: string, overrides: Record<string, string> = {}): Record<string, string> {
  return {
    product_key: key,
    name: `Fixture ${key}`,
    brand: 'Holexa',
    category_code: '10-01-01-01-00',
    short_description: 'Fixture product.',
    description_html: '<p>Fixture.</p>',
    is_bestseller: 'no',
    status: 'PUBLISHED',
    seo_title: 'Fixture',
    seo_description: 'Fixture.',
    ...overrides,
  };
}

interface BookSpec {
  products?: Array<Record<string, string>>;
  variants?: VariantInput[];
  sheets?: Record<string, Array<Record<string, string>>>;
}

async function writeBook(name: string, spec: BookSpec): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ToolHub fixtures';
  if (spec.products !== undefined || spec.variants !== undefined) {
    const products = workbook.addWorksheet('Products');
    products.columns = PRODUCT_HEADERS.map((header) => ({ header, key: header, width: 22 }));
    (spec.products ?? []).forEach((row) => products.addRow(row));
    const variants = workbook.addWorksheet('Variants');
    variants.columns = VARIANT_HEADERS.map((header) => ({ header, key: header, width: 20 }));
    (spec.variants ?? []).forEach((row) => variants.addRow(row));
  }
  for (const [sheetName, rows] of Object.entries(spec.sheets ?? {})) {
    const sheet = workbook.addWorksheet(sheetName);
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    sheet.columns = headers.map((header) => ({ header, key: header, width: 22 }));
    rows.forEach((row) => sheet.addRow(row));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  await writeFile(path.join(DIR, `${name}.xlsx`), Buffer.from(buffer));
}

async function main(): Promise<void> {
  await mkdir(DIR, { recursive: true });

  // valid.xlsx — 1 product, 2 variants, all layers pass.
  await writeBook('valid', {
    products: [product('fx-valid-1')],
    variants: [
      variant({ product_key: 'fx-valid-1', article_no: '700001 2' }),
      variant({ product_key: 'fx-valid-1', article_no: '700001 3', 'attr:cutter_diameter_nominal': '3' }),
    ],
  });

  // One invalid workbook per error class.
  await writeBook('invalid-ean-checksum', {
    products: [product('fx-ean')],
    variants: [variant({ product_key: 'fx-ean', article_no: '700002 2', ean: '4006381333930' })], // wrong check digit
  });
  await writeBook('invalid-duplicate-article', {
    products: [product('fx-dup')],
    variants: [
      variant({ product_key: 'fx-dup', article_no: '700003 2' }),
      variant({ product_key: 'fx-dup', article_no: '700003 2' }),
    ],
  });
  await writeBook('invalid-price', {
    products: [product('fx-price')],
    variants: [variant({ product_key: 'fx-price', article_no: '700004 2', list_price: '1.234.56' })],
  });
  await writeBook('invalid-category', {
    products: [product('fx-cat', { category_code: '99-99-99-99-00' })],
    variants: [variant({ product_key: 'fx-cat', article_no: '700005 2' })],
  });
  await writeBook('invalid-non-leaf-category', {
    products: [product('fx-leaf', { category_code: '10-01-01-00-00' })], // "Drills" has children
    variants: [variant({ product_key: 'fx-leaf', article_no: '700006 2' })],
  });
  await writeBook('invalid-lead-time', {
    products: [product('fx-lead')],
    variants: [variant({ product_key: 'fx-lead', article_no: '700007 2', lead_time_min_days: 14, lead_time_max_days: 11 })],
  });
  await writeBook('invalid-min-qty-pack', {
    products: [product('fx-pack')],
    variants: [variant({ product_key: 'fx-pack', article_no: '700008 2', min_order_qty: 3, pack_size: 5 })],
  });
  await writeBook('invalid-tier-order', {
    products: [product('fx-tier')],
    variants: [variant({ product_key: 'fx-tier', article_no: '700009 2' })],
    sheets: {
      PriceTiers: [
        { article_no: '700009 2', min_qty: '10', price: '450.00' },
        { article_no: '700009 2', min_qty: '5', price: '460.00' }, // quantity order broken
      ],
    },
  });
  await writeBook('invalid-missing-column', {
    sheets: {
      Products: [{ product_key: 'fx-missing', name: 'No category', brand: 'Holexa' }], // category_code absent
    },
  });
  await writeBook('invalid-bool', {
    products: [product('fx-bool')],
    variants: [variant({ product_key: 'fx-bool', article_no: '700010 2', is_active: 'maybe' })],
  });
  await writeBook('invalid-url', {
    products: [product('fx-url')],
    variants: [variant({ product_key: 'fx-url', article_no: '700011 2' })],
    sheets: {
      Images: [{ article_no: '700011 2', image_url: 'http://example.com/a.png', kind: 'PHOTO', alt: '', sort_order: '0' }],
    },
  });
  await writeBook('invalid-enum-value', {
    products: [product('fx-enum')],
    variants: [variant({ product_key: 'fx-enum', article_no: '700012 2', 'attr:coating': 'diamond-unobtainium' })],
  });
  await writeBook('invalid-required-attribute', {
    products: [product('fx-req')],
    variants: [
      {
        product_key: 'fx-req', article_no: '700013 2', ean: null, list_price: '500.00', currency: 'INR',
        price_unit: 1, unit_label: 'Piece', stock_qty: 5, lead_time_min_days: null, lead_time_max_days: null,
        min_order_qty: 1, pack_size: 1, is_active: 'yes',
        // tool_material (required + axis on Centre drills) missing
      } as VariantInput,
    ],
  });
  await writeBook('invalid-axis-duplicate', {
    products: [product('fx-axis')],
    variants: [
      variant({ product_key: 'fx-axis', article_no: '700014 2' }),
      variant({ product_key: 'fx-axis', article_no: '700014 3', 'attr:cutter_diameter_nominal': '2' }), // same axis combo
    ],
  });
  await writeBook('invalid-published-no-variant', {
    products: [product('fx-novar', { status: 'PUBLISHED' })],
  });
  await writeBook('invalid-date-range', {
    products: [product('fx-date')],
    variants: [variant({ product_key: 'fx-date', article_no: '700015 2' })],
    sheets: {
      CustomerPrices: [{ customer_number: 'CUST-001', article_no: '700015 2', price: '400.00', valid_from: '2026-12-31', valid_to: '2026-01-01' }],
    },
  });
  await writeBook('invalid-article-no', {
    products: [product('fx-artno')],
    variants: [variant({ product_key: 'fx-artno', article_no: 'bad!article#' })],
  });
  await writeBook('invalid-customer-price-above-list', {
    products: [product('fx-cprice')],
    variants: [variant({ product_key: 'fx-cprice', article_no: '700016 2', list_price: '100.00' })],
    sheets: {
      CustomerPrices: [{ customer_number: 'CUST-001', article_no: '700016 2', price: '150.00', valid_from: '', valid_to: '' }],
    },
  });
  await writeBook('invalid-published-no-image', {
    products: [product('fx-noimg', { status: 'PUBLISHED' })],
    variants: [variant({ product_key: 'fx-noimg', article_no: '700017 2' })],
  });
  await writeBook('invalid-tier-price-order', {
    products: [product('fx-tier2')],
    variants: [variant({ product_key: 'fx-tier2', article_no: '700018 2' })],
    sheets: {
      PriceTiers: [
        { article_no: '700018 2', min_qty: '5', price: '490.00' },
        { article_no: '700018 2', min_qty: '10', price: '499.00' }, // price increases
      ],
    },
  });

  console.log(`fixtures written to ${DIR}`);
}

void main();
