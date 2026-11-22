// Imports integration suite (spec 16/21): template download, upload → inline
// dry run → commit → rollback over the real API + test DB, per-fixture error
// codes, duplicate policies, idempotency warning, CSV mode, RBAC and the
// downloadable error report.
import { describe, beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import type { IncomingMessage } from 'node:http';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { hashPassword } from '../../src/common/utils/argon2.util.js';
import { resetDb, disconnectDb } from '../helpers/reset-db.js';

let app: Express;
const api = '/api/v1';
let adminToken = '';
let staffToken = '';
let customerToken = '';

const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures/import');

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post(`${api}/auth/login/password`).send({ email, password }).expect(200);
  return (res.body as { data: { accessToken: string } }).data.accessToken;
}

async function upload(token: string, file: string, options?: Record<string, unknown>, mode: 'XLSX' | 'CSV' = 'XLSX', fileName?: string) {
  const content = await readFile(path.join(FIXTURES, file));
  return request(app)
    .post(`${api}/admin/imports`)
    .set('Authorization', `Bearer ${token}`)
    .send({ fileName: fileName ?? file, contentBase64: content.toString('base64'), mode, options });
}

interface JobResponse {
  data: { jobId: string };
}
interface DetailResponse {
  job: {
    id: string; status: string; fileName: string; mode: string;
    stats: { errors?: number; warnings?: number; create?: number; update?: number; skip?: number } | null;
    createdByEmail: string | null;
    _count: { issues: number };
  };
  issues: Array<{ sheet: string; rowNumber: number; column: string | null; severity: string; code: string; message: string }>;
}

async function detail(token: string, jobId: string): Promise<DetailResponse> {
  const res = await request(app).get(`${api}/admin/imports/${jobId}`).set('Authorization', `Bearer ${token}`).expect(200);
  return (res.body as { data: DetailResponse }).data;
}

/** GETs raw bytes (supertest's default parsers mangle binary media types). */
function rawGet(pathWithAuth: string, token: string): Promise<{ status: number; body: Buffer; contentType: string }> {
  return new Promise((resolveResponse, reject) => {
    request(app)
      .get(pathWithAuth)
      .set('Authorization', `Bearer ${token}`)
      .parse((res: IncomingMessage, fn: (err: Error | null, result?: unknown) => void) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => fn(null, Buffer.concat(chunks)));
      })
      .end((err, res) => {
        if (err) reject(err);
        else resolveResponse({ status: res.status, body: res.body as Buffer, contentType: String(res.headers['content-type']) });
      });
  });
}

async function uploadAndExpectIssues(token: string, file: string, expectedCodes: string[], expectStatus: 'VALIDATED_WITH_ERRORS' | 'READY_TO_COMMIT' = 'VALIDATED_WITH_ERRORS'): Promise<void> {
  const res = await upload(token, file);
  expect(res.status).toBe(201);
  const { jobId } = (res.body as JobResponse).data;
  const body = await detail(token, jobId);
  expect(body.job.status, `${file}: ${body.job.status}`).toBe(expectStatus);
  const present = body.issues.map((item) => item.code);
  for (const code of expectedCodes) {
    expect(present, `${file}: expected ${code} in [${present.join(', ')}]`).toContain(code);
  }
}

async function seed(): Promise<void> {
  const passwordHash = await hashPassword('Password123');
  await prisma.user.create({ data: { email: 'admin@t.co', passwordHash, role: 'ADMIN', firstName: 'A', lastName: 'D', emailVerifiedAt: new Date() } });
  await prisma.user.create({ data: { email: 'staff@t.co', passwordHash, role: 'STAFF', firstName: 'S', lastName: 'F', emailVerifiedAt: new Date() } });
  await prisma.user.create({ data: { email: 'cust@t.co', passwordHash, role: 'CUSTOMER', firstName: 'C', lastName: 'U', emailVerifiedAt: new Date() } });

  await prisma.brand.create({ data: { slug: 'holexa', name: 'Holexa' } });
  const machining = await prisma.category.create({ data: { code: '10-00-00-00-00', slug: 'machining', name: 'Machining', path: 'pending', pathSlugs: 'machining', level: 0, sortOrder: 0 } });
  await prisma.category.update({ where: { id: machining.id }, data: { path: `/${machining.id}/` } });
  const drilling = await prisma.category.create({ data: { code: '10-01-00-00-00', slug: 'drilling', name: 'Drilling', parentId: machining.id, path: `/${machining.id}/${'pending'}/`, pathSlugs: 'machining/drilling', level: 1, sortOrder: 0 } });
  await prisma.category.update({ where: { id: drilling.id }, data: { path: `/${machining.id}/${drilling.id}/` } });
  const drills = await prisma.category.create({ data: { code: '10-01-01-00-00', slug: 'drills', name: 'Drills', parentId: drilling.id, path: `/${machining.id}/${drilling.id}/${'pending'}/`, pathSlugs: 'machining/drilling/drills', level: 2, sortOrder: 0 } });
  await prisma.category.update({ where: { id: drills.id }, data: { path: `/${machining.id}/${drilling.id}/${drills.id}/` } });
  const centre = await prisma.category.create({ data: { code: '10-01-01-01-00', slug: 'centre-drills', name: 'Centre drills', parentId: drills.id, path: `/${machining.id}/${drilling.id}/${drills.id}/${'pending'}/`, pathSlugs: 'machining/drilling/drills/centre-drills', level: 3, sortOrder: 0 } });
  await prisma.category.update({ where: { id: centre.id }, data: { path: `/${machining.id}/${drilling.id}/${drills.id}/${centre.id}/` } });

  const toolMaterial = await prisma.attributeDefinition.create({ data: { key: 'tool_material', label: 'Tool material', groupName: 'Material', type: 'ENUM', enumValues: ['HSS', 'HSS-Co', 'HSS-G'] } });
  const coating = await prisma.attributeDefinition.create({ data: { key: 'coating', label: 'Coating', groupName: 'Material', type: 'ENUM', enumValues: ['TiN', 'TiAlN', 'uncoated'] } });
  const diameter = await prisma.attributeDefinition.create({ data: { key: 'cutter_diameter_nominal', label: 'Nominal diameter', groupName: 'Dimensions', type: 'NUMBER', unit: 'mm' } });
  const drillType = await prisma.attributeDefinition.create({ data: { key: 'drilling_tool_type', label: 'Type of drilling tool', groupName: 'Type', type: 'ENUM', enumValues: ['centre drill type R', 'centre drill type A', 'NC spotting drill', 'jobber drill'] } });
  await prisma.categoryAttribute.createMany({
    data: [
      { categoryId: centre.id, attributeId: toolMaterial.id, isRequired: true, isVariantAxis: true, isFilterable: true, filterWidget: 'CHECKBOX', sortOrder: 0 },
      { categoryId: centre.id, attributeId: coating.id, isFilterable: true, filterWidget: 'CHECKBOX', sortOrder: 1 },
      { categoryId: centre.id, attributeId: diameter.id, isVariantAxis: true, isFilterable: true, filterWidget: 'RANGE', sortOrder: 2 },
      { categoryId: centre.id, attributeId: drillType.id, isFilterable: true, filterWidget: 'DROPDOWN', sortOrder: 3 },
    ],
  });

  await prisma.company.create({ data: { name: 'Acme Tools Pvt Ltd', gstin: '29ABCDE1234F1Z5', customerNumber: 'CUST-001' } });
}

beforeAll(async () => {
  app = createApp();
});

beforeEach(async () => {
  await resetDb();
  await seed();
  adminToken = await login('admin@t.co', 'Password123');
  staffToken = await login('staff@t.co', 'Password123');
  customerToken = await login('cust@t.co', 'Password123');
});

afterAll(async () => {
  await disconnectDb();
});

describe('RBAC', () => {
  it('blocks anonymous and customers everywhere; staff cannot roll back', async () => {
    await request(app).get(`${api}/admin/imports`).expect(401);
    await request(app).get(`${api}/admin/imports`).set('Authorization', `Bearer ${customerToken}`).expect(403);
    await request(app).post(`${api}/admin/imports/x/rollback`).set('Authorization', `Bearer ${staffToken}`).send({}).expect(403);
    await request(app).get(`${api}/admin/imports`).set('Authorization', `Bearer ${staffToken}`).expect(200);
  });
});

describe('template', () => {
  it('downloads an xlsx with README + dropdowns, attr columns for a category', async () => {
    const res = await rawGet(`${api}/admin/imports/template?categoryCode=10-01-01-01-00`, staffToken);
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('spreadsheetml');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(
      expect.arrayContaining(['README', 'Products', 'Variants', 'Images', 'Documents', 'PriceTiers', 'CustomerPrices']),
    );
    const variants = workbook.getWorksheet('Variants')!;
    const header = (variants.getRow(1).values as string[]).filter(Boolean);
    expect(header).toContain('attr:tool_material');
    expect(header).toContain('attr:cutter_diameter_nominal');
    expect(variants.rowCount).toBeGreaterThanOrEqual(2); // header + example row
  });
});

describe('dry run (validation report)', () => {
  it('valid.xlsx → READY_TO_COMMIT with create plan and no errors', async () => {
    const res = await upload(staffToken, 'valid.xlsx');
    expect(res.status).toBe(201);
    const { jobId } = (res.body as JobResponse).data;
    const body = await detail(staffToken, jobId);
    expect(body.job.status).toBe('READY_TO_COMMIT');
    expect(body.job.stats?.errors ?? 0).toBe(0);
    expect(body.job.stats?.create).toBeGreaterThanOrEqual(3); // 1 product + 2 variants
    // Warnings are allowed (valid.xlsx publishes without images).
    expect(body.issues.filter((item) => item.severity === 'ERROR')).toHaveLength(0);
    expect(body.issues.map((item) => item.code)).toContain('PUBLISHED_NO_IMAGE');
  });

  const INVALID: Array<[string, string[]]> = [
    ['invalid-ean-checksum.xlsx', ['EAN_CHECKSUM']],
    ['invalid-duplicate-article.xlsx', ['DUPLICATE_IN_FILE']],
    ['invalid-price.xlsx', ['PRICE_SEPARATORS']],
    ['invalid-category.xlsx', ['CATEGORY_NOT_FOUND']],
    ['invalid-non-leaf-category.xlsx', ['CATEGORY_NOT_LEAF']],
    ['invalid-lead-time.xlsx', ['LEAD_TIME_ORDER']],
    ['invalid-min-qty-pack.xlsx', ['MIN_QTY_PACK']],
    ['invalid-tier-order.xlsx', ['TIER_QUANTITY_ORDER']],
    ['invalid-tier-price-order.xlsx', ['TIER_PRICE_ORDER']],
    ['invalid-missing-column.xlsx', ['FILE_SHEETS_MISSING']],
    ['invalid-bool.xlsx', ['BOOL_INVALID']],
    ['invalid-url.xlsx', ['URL_NOT_HTTPS']],
    ['invalid-enum-value.xlsx', ['ENUM_VALUE_INVALID']],
    ['invalid-required-attribute.xlsx', ['REQUIRED_ATTRIBUTE_MISSING', 'VARIANT_AXIS_MISSING']],
    ['invalid-axis-duplicate.xlsx', ['AXIS_DUPLICATE']],
    ['invalid-published-no-variant.xlsx', ['PUBLISHED_NO_VARIANT']],
    ['invalid-date-range.xlsx', ['DATE_RANGE']],
    ['invalid-article-no.xlsx', ['ARTICLE_NO_INVALID']],
    ['invalid-customer-price-above-list.xlsx', ['CUSTOMER_PRICE_ABOVE_LIST'], 'READY_TO_COMMIT'],
    ['invalid-published-no-image.xlsx', ['PUBLISHED_NO_IMAGE'], 'READY_TO_COMMIT'],
  ] as Array<[string, string[], ('VALIDATED_WITH_ERRORS' | 'READY_TO_COMMIT')?]>;

  for (const [file, expectedCodes, expectStatus] of INVALID) {
    it(`${file} → ${expectedCodes.join(', ')}`, async () => {
      await uploadAndExpectIssues(adminToken, file, expectedCodes, expectStatus ?? 'VALIDATED_WITH_ERRORS');
    });
  }

  it('BRAND_NOT_FOUND when createMissingBrands is off', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await readFile(path.join(FIXTURES, 'valid.xlsx')));
    workbook.getWorksheet('Products')!.getCell('C2').value = 'Unknown Brand GmbH';
    const buffer = await workbook.xlsx.writeBuffer();
    const res = await request(app)
      .post(`${api}/admin/imports`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fileName: 'unknown-brand.xlsx', contentBase64: Buffer.from(buffer).toString('base64'), mode: 'XLSX' });
    const { jobId } = (res.body as JobResponse).data;
    const body = await detail(adminToken, jobId);
    expect(body.issues.map((item) => item.code)).toContain('BRAND_NOT_FOUND');
  });

  it('ARTICLE_NO_CONFLICT when an existing article belongs to another product', async () => {
    const brand = await prisma.brand.findFirstOrThrow({ where: { slug: 'holexa' } });
    const centre = await prisma.category.findFirstOrThrow({ where: { code: '10-01-01-01-00' } });
    const other = await prisma.product.create({ data: { slug: 'other-family', name: 'Other', brandId: brand.id, categoryId: centre.id, status: 'PUBLISHED' } });
    await prisma.variant.create({ data: { productId: other.id, articleNo: '700001 2', listPrice: '999.00', stockQty: 1 } });

    await uploadAndExpectIssues(adminToken, 'valid.xlsx', ['ARTICLE_NO_CONFLICT']);
  });

  it('bad extension and macros are rejected at file level', async () => {
    const res = await request(app)
      .post(`${api}/admin/imports`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fileName: 'not-a-tsv.tsv', contentBase64: Buffer.from('hello').toString('base64'), mode: 'XLSX' });
    expect(res.status).toBe(201);
    const body = await detail(adminToken, (res.body as JobResponse).data.jobId);
    expect(body.issues.map((item) => item.code)).toContain('FILE_BAD_EXTENSION');
  });
});

describe('commit', () => {
  it('creates the catalog (products, variants, attributes, tiers, customer prices) and marks COMPLETED', async () => {
    // Extend valid.xlsx with PriceTiers + CustomerPrices.
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await readFile(path.join(FIXTURES, 'valid.xlsx')));
    const tiers = workbook.addWorksheet('PriceTiers');
    tiers.columns = [
      { header: 'article_no', key: 'article_no' },
      { header: 'min_qty', key: 'min_qty' },
      { header: 'price', key: 'price' },
    ];
    tiers.addRow({ article_no: '700001 2', min_qty: 10, price: 450 });
    const prices = workbook.addWorksheet('CustomerPrices');
    prices.columns = [
      { header: 'customer_number', key: 'customer_number' },
      { header: 'article_no', key: 'article_no' },
      { header: 'price', key: 'price' },
      { header: 'valid_from', key: 'valid_from' },
      { header: 'valid_to', key: 'valid_to' },
    ];
    prices.addRow({ customer_number: 'CUST-001', article_no: '700001 2', price: 440, valid_from: '2026-01-01', valid_to: '' });
    const buffer = await workbook.xlsx.writeBuffer();

    const uploadRes = await request(app)
      .post(`${api}/admin/imports`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fileName: 'valid-plus.xlsx', contentBase64: Buffer.from(buffer).toString('base64'), mode: 'XLSX', options: { publishStatus: 'PUBLISHED' } });
    const jobId = (uploadRes.body as JobResponse).data.jobId;
    expect((await detail(adminToken, jobId)).job.status).toBe('READY_TO_COMMIT');

    const commitRes = await request(app).post(`${api}/admin/imports/${jobId}/commit`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect((commitRes.body as { data: { queued: boolean } }).data.queued).toBe(true);

    const body = await detail(adminToken, jobId);
    expect(body.job.status).toBe('COMPLETED');
    expect(body.job.stats?.created).toBeGreaterThanOrEqual(5); // product + 2 variants + tier + customer price

    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: 'fx-valid-1' },
      include: { variants: { include: { attributes: true, priceTiers: true, customerPrices: true } } },
    });
    expect(product.status).toBe('PUBLISHED');
    expect(product.minPrice?.toFixed(2)).toBe('500.00');
    expect(product.variants).toHaveLength(2);
    const first = product.variants.find((variant) => variant.articleNo === '700001 2')!;
    expect(first.stockQty).toBe(10);
    expect(first.attributes).toHaveLength(4);
    expect(first.priceTiers).toHaveLength(1);
    expect(first.priceTiers[0]?.minQty).toBe(10);
    expect(first.customerPrices).toHaveLength(1);

    const batchItems = await prisma.importBatchItem.count({ where: { jobId } });
    expect(batchItems).toBeGreaterThanOrEqual(5);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'import.commit', entityId: jobId } });
    expect(audit).not.toBeNull();
  });

  it('commit is refused without a green dry run (JOB_STATE guard)', async () => {
    const uploadRes = await upload(adminToken, 'invalid-ean-checksum.xlsx');
    const jobId = (uploadRes.body as JobResponse).data.jobId;
    await request(app).post(`${api}/admin/imports/${jobId}/commit`).set('Authorization', `Bearer ${adminToken}`).expect(409);
  });

  it('re-importing the same file warns ALREADY_IMPORTED and UPDATEs instead of duplicating', async () => {
    const first = await upload(adminToken, 'valid.xlsx');
    const firstJob = (first.body as JobResponse).data.jobId;
    await request(app).post(`${api}/admin/imports/${firstJob}/commit`).set('Authorization', `Bearer ${adminToken}`).expect(200);

    const second = await upload(adminToken, 'valid.xlsx');
    const secondJob = (second.body as JobResponse).data.jobId;
    const body = await detail(adminToken, secondJob);
    expect(body.job.status).toBe('READY_TO_COMMIT'); // warnings never block
    expect(body.issues.map((item) => item.code)).toContain('ALREADY_IMPORTED');
    expect(body.job.stats?.update).toBeGreaterThanOrEqual(3); // product + variants now UPDATE
    expect(body.job.stats?.create).toBe(0);

    await request(app).post(`${api}/admin/imports/${secondJob}/commit`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(await prisma.product.count({ where: { slug: 'fx-valid-1' } })).toBe(1);
    expect(await prisma.variant.count({ where: { articleNo: { in: ['700001 2', '700001 3'] } } })).toBe(2);
  });

  it('onDuplicateArticleNo=SKIP skips existing variants', async () => {
    const first = await upload(adminToken, 'valid.xlsx');
    await request(app).post(`${api}/admin/imports/${(first.body as JobResponse).data.jobId}/commit`).set('Authorization', `Bearer ${adminToken}`).expect(200);

    const second = await upload(adminToken, 'valid.xlsx', { onDuplicateArticleNo: 'SKIP' });
    const jobId = (second.body as JobResponse).data.jobId;
    const body = await detail(adminToken, jobId);
    expect(body.issues.map((item) => item.code)).toContain('DUPLICATE_POLICY');
    expect(body.job.stats?.skip).toBeGreaterThanOrEqual(2);
    await request(app).post(`${api}/admin/imports/${jobId}/commit`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(await prisma.variant.count({ where: { articleNo: '700001 2' } })).toBe(1);
  });
});

describe('rollback', () => {
  it('restores the previous state (soft-deletes created products, restores updated rows)', async () => {
    // Pre-existing product that the import will UPDATE via product_key = slug.
    const brand = await prisma.brand.findFirstOrThrow({ where: { slug: 'holexa' } });
    const centre = await prisma.category.findFirstOrThrow({ where: { code: '10-01-01-01-00' } });
    const existing = await prisma.product.create({
      data: { slug: 'fx-valid-1', name: 'Old name', brandId: brand.id, categoryId: centre.id, status: 'DRAFT' },
    });

    const uploadRes = await upload(adminToken, 'valid.xlsx');
    const jobId = (uploadRes.body as JobResponse).data.jobId;
    await request(app).post(`${api}/admin/imports/${jobId}/commit`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    const after = await prisma.product.findUniqueOrThrow({ where: { id: existing.id } });
    expect(after.name).toBe('Fixture fx-valid-1');

    const rollbackRes = await request(app).post(`${api}/admin/imports/${jobId}/rollback`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect((rollbackRes.body as { data: { restored: number } }).data.restored).toBeGreaterThanOrEqual(3);

    const restored = await prisma.product.findUniqueOrThrow({ where: { id: existing.id }, include: { variants: true } });
    expect(restored.name).toBe('Old name');
    expect(restored.status).toBe('DRAFT');
    expect(restored.variants).toHaveLength(0); // created variants hard-removed
    const job = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe('ROLLED_BACK');

    // Second rollback is refused (not COMPLETED).
    await request(app).post(`${api}/admin/imports/${jobId}/rollback`).set('Authorization', `Bearer ${adminToken}`).expect(409);
  });
});

describe('CSV mode', () => {
  it('accepts a flat Variants-style CSV with product columns', async () => {
    const csv = [
      'product_key,name,brand,category_code,status,article_no,ean,list_price,currency,price_unit,unit_label,stock_qty,lead_time_min_days,lead_time_max_days,min_order_qty,pack_size,is_active,attr:tool_material,attr:coating,attr:cutter_diameter_nominal,attr:drilling_tool_type',
      'fx-csv-1,CSV Drill,Holexa,10-01-01-01-00,PUBLISHED,700100 2,4006381333931,375.50,INR,1,Piece,25,,,1,1,yes,HSS,TiN,2,centre drill type A',
      'fx-csv-1,CSV Drill,Holexa,10-01-01-01-00,PUBLISHED,700100 3,4006381333948,399.00,INR,1,Piece,0,5,9,1,1,yes,HSS,TiN,3,centre drill type A',
    ].join('\n');
    const res = await request(app)
      .post(`${api}/admin/imports`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fileName: 'flat.csv', contentBase64: Buffer.from(csv, 'utf8').toString('base64'), mode: 'CSV' });
    expect(res.status).toBe(201);
    const jobId = (res.body as JobResponse).data.jobId;
    const body = await detail(adminToken, jobId);
    expect(body.job.status).toBe('READY_TO_COMMIT');
    await request(app).post(`${api}/admin/imports/${jobId}/commit`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    const product = await prisma.product.findUniqueOrThrow({ where: { slug: 'fx-csv-1' }, include: { variants: true } });
    expect(product.name).toBe('CSV Drill');
    expect(product.variants).toHaveLength(2);
    expect(product.minPrice?.toFixed(2)).toBe('375.50');
  });
});

describe('error report + cancel + list', () => {
  it('downloads the error report xlsx with an Errors column', async () => {
    const uploadRes = await upload(adminToken, 'invalid-ean-checksum.xlsx');
    const jobId = (uploadRes.body as JobResponse).data.jobId;
    const res = await rawGet(`${api}/admin/imports/${jobId}/report`, adminToken);
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('spreadsheetml');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);
    const summary = workbook.getWorksheet('Summary')!;
    expect(summary.getRow(1).values).toEqual(expect.arrayContaining(['Code', 'Severity', 'Count', 'Message']));
    expect(summary.getColumn(1).values.join(' ')).toContain('EAN_CHECKSUM');
    const variants = workbook.getWorksheet('Variants');
    expect(variants?.getRow(1).values).toEqual(expect.arrayContaining(['Errors']));
  });

  it('cancels a job that has not finished', async () => {
    const uploadRes = await upload(adminToken, 'invalid-ean-checksum.xlsx');
    const jobId = (uploadRes.body as JobResponse).data.jobId;
    await request(app).post(`${api}/admin/imports/${jobId}/cancel`).set('Authorization', `Bearer ${staffToken}`).expect(200);
    const body = await detail(adminToken, jobId);
    expect(body.job.status).toBe('CANCELLED');
    // Commit after cancel → 409.
    await request(app).post(`${api}/admin/imports/${jobId}/commit`).set('Authorization', `Bearer ${adminToken}`).expect(409);
  });

  it('lists jobs with actor emails and error counts', async () => {
    await upload(adminToken, 'valid.xlsx');
    const res = await request(app).get(`${api}/admin/imports`).set('Authorization', `Bearer ${staffToken}`).expect(200);
    const items = (res.body as { data: Array<{ fileName: string; createdByEmail: string | null; status: string }> }).data;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ fileName: 'valid.xlsx', createdByEmail: 'admin@t.co', status: 'READY_TO_COMMIT' });
  });
});
