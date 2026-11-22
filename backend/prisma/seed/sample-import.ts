// Sample import workbook (spec Section 22): a VALID .xlsx exercising the full
// Products/Variants schema of the bulk import (Section 16.2), containing three
// families that do NOT exist in the seed catalog (so dry-runs create them).
import ExcelJS from 'exceljs';
import { makeGtin13 } from './util.js';

const PRODUCT_HEADERS = [
  'product_key',
  'name',
  'brand',
  'category_code',
  'short_description',
  'description_html',
  'is_bestseller',
  'status',
  'seo_title',
  'seo_description',
] as const;

const VARIANT_HEADERS = [
  'product_key',
  'article_no',
  'ean',
  'list_price',
  'currency',
  'price_unit',
  'unit_label',
  'stock_qty',
  'lead_time_min_days',
  'lead_time_max_days',
  'min_order_qty',
  'pack_size',
  'is_active',
  'attr:cutter_diameter_nominal',
  'attr:tool_material',
  'attr:coating',
  'attr:drilling_tool_type',
] as const;

interface ProductRow {
  product_key: string;
  name: string;
  brand: string;
  category_code: string;
  short_description: string;
  description_html: string;
  is_bestseller: 'no';
  status: 'PUBLISHED';
  seo_title: string;
  seo_description: string;
}

interface VariantRow {
  product_key: string;
  article_no: string;
  ean: string;
  list_price: string;
  currency: 'INR';
  price_unit: number;
  unit_label: 'Piece';
  stock_qty: number;
  lead_time_min_days: number | null;
  lead_time_max_days: number | null;
  min_order_qty: number;
  pack_size: number;
  is_active: 'yes';
  'attr:cutter_diameter_nominal': string;
  'attr:tool_material': string;
  'attr:coating': string;
  'attr:drilling_tool_type': string;
}

function centreDrillVariant(
  key: string,
  seq: number,
  diameter: string,
  price: string,
  stock: number,
  lead: [number, number] | null,
): VariantRow {
  return {
    product_key: key,
    article_no: `211100 ${seq}`,
    ean: makeGtin13(`211100${String(seq).padStart(6, '0')}`),
    list_price: price,
    currency: 'INR',
    price_unit: 1,
    unit_label: 'Piece',
    stock_qty: stock,
    lead_time_min_days: lead?.[0] ?? null,
    lead_time_max_days: lead?.[1] ?? null,
    min_order_qty: 1,
    pack_size: 1,
    is_active: 'yes',
    'attr:cutter_diameter_nominal': diameter,
    'attr:tool_material': 'HSS-Co',
    'attr:coating': 'TiN',
    'attr:drilling_tool_type': 'centre drill type R',
  };
}

const PRODUCTS: ProductRow[] = [
  {
    product_key: 'sample-centre-drill-hssco-r-tin',
    name: 'Centre drill HSS-Co R TiN',
    brand: 'Holexa',
    category_code: '10-01-01-01-00',
    short_description: 'Type R centre drill with radius form, HSS-Co with TiN coating, DIN 333.',
    description_html:
      '<p>Type R centre drill with radius grind for centre holes to DIN 333. Cobalt-alloy HSS-Co substrate with TiN coating for improved wear behaviour in steel.</p>',
    is_bestseller: 'no',
    status: 'PUBLISHED',
    seo_title: 'Centre drill HSS-Co R TiN — DIN 333',
    seo_description: 'Type R centre drills, HSS-Co with TiN coating, diameter 1–4 mm, DIN 333. In stock at ToolHub India.',
  },
  {
    product_key: 'sample-spotting-drill-hss-90',
    name: 'NC spotting drill HSS 90° short',
    brand: 'Ferrotool',
    category_code: '10-01-01-02-00',
    short_description: 'NC spotting drill, 90° point, short version for precise hole location.',
    description_html: '<p>90° NC spotting drill for exact pre-positioning in CNC work. Short, rigid version for stable spotting without deflection.</p>',
    is_bestseller: 'no',
    status: 'PUBLISHED',
    seo_title: 'NC spotting drill HSS 90° short',
    seo_description: '90° NC spotting drills in HSS, short version, 3–8 mm. Spot holes precisely before drilling.',
  },
  {
    product_key: 'sample-jobber-drill-hssg-8xd',
    name: 'Jobber drill HSS-G rolled 5xD',
    brand: 'Torqueline',
    category_code: '10-01-01-03-00',
    short_description: 'Rolled jobber drill HSS-G, 5xD, general purpose in steel.',
    description_html: '<p>General purpose jobber drill to DIN 338, rolled flutes for cost-efficient series drilling in steels up to 800 N/mm².</p>',
    is_bestseller: 'no',
    status: 'PUBLISHED',
    seo_title: 'Jobber drill HSS-G rolled 5xD DIN 338',
    seo_description: 'Rolled HSS-G jobber drills, 5xD flute length, DIN 338, diameters 4–10 mm.',
  },
];

const VARIANTS: VariantRow[] = [
  centreDrillVariant('sample-centre-drill-hssco-r-tin', 1, '1', '1180.50', 120, null),
  centreDrillVariant('sample-centre-drill-hssco-r-tin', 2, '1.6', '1230.00', 80, null),
  centreDrillVariant('sample-centre-drill-hssco-r-tin', 3, '2.5', '1290.75', 0, [11, 14]),
  centreDrillVariant('sample-centre-drill-hssco-r-tin', 4, '4', '1415.00', 45, null),
  {
    product_key: 'sample-spotting-drill-hss-90',
    article_no: '311100 3',
    ean: makeGtin13('311100000003'),
    list_price: '940.00',
    currency: 'INR',
    price_unit: 1,
    unit_label: 'Piece',
    stock_qty: 200,
    lead_time_min_days: null,
    lead_time_max_days: null,
    min_order_qty: 1,
    pack_size: 1,
    is_active: 'yes',
    'attr:cutter_diameter_nominal': '3',
    'attr:tool_material': 'HSS',
    'attr:coating': 'uncoated',
    'attr:drilling_tool_type': 'NC spotting drill',
  },
  {
    product_key: 'sample-spotting-drill-hss-90',
    article_no: '311100 5',
    ean: makeGtin13('311100000005'),
    list_price: '1020.00',
    currency: 'INR',
    price_unit: 1,
    unit_label: 'Piece',
    stock_qty: 150,
    lead_time_min_days: null,
    lead_time_max_days: null,
    min_order_qty: 1,
    pack_size: 1,
    is_active: 'yes',
    'attr:cutter_diameter_nominal': '5',
    'attr:tool_material': 'HSS',
    'attr:coating': 'uncoated',
    'attr:drilling_tool_type': 'NC spotting drill',
  },
  {
    product_key: 'sample-jobber-drill-hssg-8xd',
    article_no: '411100 4',
    ean: makeGtin13('411100000004'),
    list_price: '310.25',
    currency: 'INR',
    price_unit: 1,
    unit_label: 'Piece',
    stock_qty: 900,
    lead_time_min_days: null,
    lead_time_max_days: null,
    min_order_qty: 5,
    pack_size: 5,
    is_active: 'yes',
    'attr:cutter_diameter_nominal': '4',
    'attr:tool_material': 'HSS-G',
    'attr:coating': 'uncoated',
    'attr:drilling_tool_type': '', // not mapped on Jobber drills
  },
  {
    product_key: 'sample-jobber-drill-hssg-8xd',
    article_no: '411100 8',
    ean: makeGtin13('411100000008'),
    list_price: '365.00',
    currency: 'INR',
    price_unit: 1,
    unit_label: 'Piece',
    stock_qty: 0,
    lead_time_min_days: 5,
    lead_time_max_days: 9,
    min_order_qty: 5,
    pack_size: 5,
    is_active: 'yes',
    'attr:cutter_diameter_nominal': '8',
    'attr:tool_material': 'HSS-G',
    'attr:coating': 'uncoated',
    'attr:drilling_tool_type': '', // not mapped on Jobber drills
  },
];

/** Writes the sample workbook to `prisma/seed/sample-import.xlsx`. */
export async function writeSampleImportWorkbook(target: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ToolHub seed';
  wb.created = new Date();

  const products = wb.addWorksheet('Products');
  products.columns = PRODUCT_HEADERS.map((header) => ({ header, key: header, width: 26 }));
  PRODUCTS.forEach((row) => products.addRow(row));

  const variants = wb.addWorksheet('Variants');
  variants.columns = VARIANT_HEADERS.map((header) => ({ header, key: header, width: 22 }));
  VARIANTS.forEach((row) => variants.addRow(row));

  const readme = wb.addWorksheet('README');
  readme.getColumn(1).width = 120;
  readme.addRow(['ToolHub bulk import — sample workbook (valid file)']);
  readme.addRow(['']);
  readme.addRow(['Sheets: Products (one row per family) and Variants (one row per article).']);
  readme.addRow(['Attribute columns use the prefix attr:<attribute_key> and must be mapped to the category.']);
  readme.addRow(['Booleans accept yes/no/true/false/1/0. EANs must be valid GTIN-8/12/13/14.']);
  readme.addRow(['Run an Import Center dry run first: the validator reports issues without writing catalog data.']);

  await wb.xlsx.writeFile(target);
}
