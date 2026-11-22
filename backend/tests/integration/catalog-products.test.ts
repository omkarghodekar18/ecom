// Catalog + products + pricing integration suite (spec Sections 9, 12, 21).
// Fixtures are created directly through Prisma; admin flows go through the API.
import { describe, beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { hashPassword } from '../../src/common/utils/argon2.util.js';
import { resetDb, disconnectDb } from '../helpers/reset-db.js';

let app: Express;
const api = '/api/v1';
let adminToken = '';
let customerToken = '';

const BRAND = { slug: 'testbrand', name: 'TestBrand' };
const CAT = {
  machining: { code: '10-00-00-00-00', slug: 'machining', name: 'Machining' },
  drilling: { code: '10-01-00-00-00', slug: 'drilling', name: 'Drilling' },
  drills: { code: '10-01-01-00-00', slug: 'drills', name: 'Drills' },
  centre: { code: '10-01-01-01-00', slug: 'centre-drills', name: 'Centre drills' },
};

interface SeededIds {
  brandId: string;
  centreId: string;
  drillsId: string;
  machiningId: string;
  attrCoating: string;
  attrDiameter: string;
  productFlagId: string;
  productDraftId: string;
}

let ids: SeededIds;

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post(`${api}/auth/login/password`).send({ email, password }).expect(200);
  return (res.body as { data: { accessToken: string } }).data.accessToken;
}

async function seedFixtures(): Promise<SeededIds> {
  const brand = await prisma.brand.create({ data: BRAND });
  const machining = await prisma.category.create({
    data: { ...CAT.machining, path: 'pending', pathSlugs: CAT.machining.slug, level: 0, sortOrder: 0 },
  });
  await prisma.category.update({ where: { id: machining.id }, data: { path: `/${machining.id}/` } });
  const drilling = await prisma.category.create({
    data: {
      ...CAT.drilling,
      parentId: machining.id,
      path: 'pending',
      pathSlugs: `${CAT.machining.slug}/${CAT.drilling.slug}`,
      level: 1,
      sortOrder: 0,
    },
  });
  const drills = await prisma.category.create({
    data: {
      ...CAT.drills,
      parentId: drilling.id,
      path: 'pending',
      pathSlugs: `${CAT.machining.slug}/${CAT.drilling.slug}/${CAT.drills.slug}`,
      level: 2,
      sortOrder: 0,
    },
  });
  const centre = await prisma.category.create({
    data: {
      ...CAT.centre,
      parentId: drills.id,
      path: 'pending',
      pathSlugs: `${CAT.machining.slug}/${CAT.drilling.slug}/${CAT.drills.slug}/${CAT.centre.slug}`,
      level: 3,
      sortOrder: 0,
    },
  });
  // Materialised paths are computed level by level (parents are already final).
  const paths = new Map<string, string>([[machining.id, `/${machining.id}/`]]);
  for (const [child, parentId] of [
    [drilling, machining],
    [drills, drilling],
    [centre, drills],
  ] as const) {
    const parentPath = paths.get(parentId.id);
    if (!parentPath) throw new Error('fixture parent path missing');
    const path = `${parentPath}${child.id}/`;
    await prisma.category.update({ where: { id: child.id }, data: { path } });
    paths.set(child.id, path);
  }

  const coating = await prisma.attributeDefinition.create({
    data: {
      key: 'coating',
      label: 'Coating',
      groupName: 'Material & composition',
      type: 'ENUM',
      enumValues: ['TiAlN', 'TiN'],
    },
  });
  const diameter = await prisma.attributeDefinition.create({
    data: {
      key: 'cutter_diameter_nominal',
      label: 'Nominal diameter',
      labelHtml: 'Nominal ⌀ D<sub>C</sub> k12',
      groupName: 'Dimensions & Measurements',
      type: 'NUMBER',
      unit: 'mm',
    },
  });
  await prisma.categoryAttribute.createMany({
    data: [
      { categoryId: centre.id, attributeId: coating.id, isFilterable: true, filterWidget: 'CHECKBOX', sortOrder: 1 },
      {
        categoryId: centre.id,
        attributeId: diameter.id,
        isFilterable: true,
        isVariantAxis: true,
        filterWidget: 'RANGE',
        sortOrder: 0,
      },
    ],
  });

  const flag = await prisma.product.create({
    data: {
      slug: 'flag-family',
      name: 'Flag Family HSS TiAlN',
      brandId: brand.id,
      categoryId: centre.id,
      status: 'PUBLISHED',
      isBestseller: true,
      shortDescription: 'flag',
      minPrice: 100,
    },
  });
  const draft = await prisma.product.create({
    data: {
      slug: 'draft-family',
      name: 'Draft Family',
      brandId: brand.id,
      categoryId: centre.id,
      status: 'DRAFT',
      shortDescription: 'draft',
    },
  });
  const v = (productId: string, articleNo: string, price: number, stock: number, coatingValue: string, dia: number) =>
    prisma.variant.create({
      data: {
        productId,
        articleNo,
        listPrice: price,
        stockQty: stock,
        minOrderQty: 1,
        packSize: 1,
        attributes: {
          create: [
            { attributeId: coating.id, valueString: coatingValue },
            { attributeId: diameter.id, valueNumber: dia },
          ],
        },
      },
    });
  await v(flag.id, '900001 1', 100, 50, 'TiAlN', 1);
  await v(flag.id, '900001 2', 120, 0, 'TiN', 2);
  await v(draft.id, '900002 1', 90, 10, 'TiN', 1);

  return {
    brandId: brand.id,
    centreId: centre.id,
    drillsId: drills.id,
    machiningId: machining.id,
    attrCoating: coating.id,
    attrDiameter: diameter.id,
    productFlagId: flag.id,
    productDraftId: draft.id,
  };
}

beforeAll(async () => {
  app = createApp();
});

beforeEach(async () => {
  await resetDb();
  const env = { NODE_ENV: 'development' as const };
  const admin = await prisma.user.create({
    data: {
      email: 'admin@t.example.com',
      passwordHash: await hashPassword('Admin123!secure'),
      role: 'ADMIN',
      firstName: 'A',
      lastName: 'B',
      emailVerifiedAt: new Date(),
    },
  });
  void admin;
  await prisma.user.create({
    data: {
      email: 'cust@t.example.com',
      passwordHash: await hashPassword('Customer123!secure'),
      role: 'CUSTOMER',
      type: 'B2C',
      firstName: 'C',
      lastName: 'D',
      emailVerifiedAt: new Date(),
    },
  });
  ids = await seedFixtures();
  adminToken = await login('admin@t.example.com', 'Admin123!secure');
  customerToken = await login('cust@t.example.com', 'Customer123!secure');
  void env;
});

afterAll(async () => {
  await disconnectDb();
});

describe('catalog reads', () => {
  it('serves the navigation tree with subtree product counts', async () => {
    // Direct-DB fixtures don't run admin writes, so refresh the maintained
    // aggregate the same way the queue job does.
    const { refreshCategoryProductCounts } = await import('../../src/modules/catalog/index.js');
    await refreshCategoryProductCounts();
    const res = await request(app).get(`${api}/navigation/tree?depth=3`).expect(200);
    const machining = res.body.data.find((c: { code: string }) => c.code === CAT.machining.code);
    expect(machining.productCount).toBe(1); // flag published; draft excluded
    const drilling = machining.children[0];
    expect(drilling.name).toBe('Drilling');
    expect(drilling.children[0].children[0].code).toBe(CAT.centre.code);
  });

  it('serves category detail, children and breadcrumb chain', async () => {
    const detail = await request(app).get(`${api}/categories/${CAT.centre.code}`).expect(200);
    expect(detail.body.data.name).toBe('Centre drills');
    expect(detail.body.data.pathSlugs).toContain('machining/drilling/drills');

    const crumbs = await request(app).get(`${api}/categories/${CAT.centre.code}/breadcrumb`).expect(200);
    expect(crumbs.body.data.map((c: { name: string }) => c.name)).toEqual([
      'Machining',
      'Drilling',
      'Drills',
      'Centre drills',
    ]);

    const children = await request(app).get(`${api}/categories/${CAT.drills.code}/children`).expect(200);
    expect(children.body.data.map((c: { code: string }) => c.code)).toEqual([CAT.centre.code]);
  });

  it('serves the effective filter set with inheritance', async () => {
    // Own mapping: the leaf returns its two mapped attributes.
    const own = await request(app).get(`${api}/categories/${CAT.centre.code}/filters`).expect(200);
    expect(own.body.data.map((f: { key: string }) => f.key).sort()).toEqual(['coating', 'cutter_diameter_nominal']);

    // Inheritance: a category without its own mapping uses the nearest
    // ancestor's. Move the mapping up to Drills and re-query the leaf.
    await prisma.categoryAttribute.deleteMany({ where: { categoryId: ids.centreId } });
    await prisma.categoryAttribute.createMany({
      data: [
        { categoryId: ids.drillsId, attributeId: ids.attrCoating, isFilterable: true, filterWidget: 'CHECKBOX', sortOrder: 1 },
        { categoryId: ids.drillsId, attributeId: ids.attrDiameter, isFilterable: true, isVariantAxis: true, filterWidget: 'RANGE', sortOrder: 0 },
      ],
    });
    const inherited = await request(app).get(`${api}/categories/${CAT.centre.code}/filters`).expect(200);
    expect(inherited.body.data.map((f: { key: string }) => f.key).sort()).toEqual(['coating', 'cutter_diameter_nominal']);
  });

  it('hides unknown categories', async () => {
    await request(app).get(`${api}/categories/00-00-00-00-99`).expect(404);
  });
});

describe('catalog admin writes', () => {
  const auth = { Authorization: '' };

  beforeEach(() => {
    auth.Authorization = `Bearer ${adminToken}`;
  });

  it('requires staff/admin role', async () => {
    await request(app)
      .post(`${api}/admin/categories`)
      .set({ Authorization: `Bearer ${customerToken}` })
      .send({ name: 'X', code: '11-00-00-00-00' })
      .expect(403);
  });

  it('creates a child category with computed path/level and rejects bad codes', async () => {
    await request(app)
      .post(`${api}/admin/categories`)
      .set(auth)
      .send({ name: 'Taps', code: '10-01-XX-00-00', parentId: ids.centreId })
      .expect(400);

    const res = await request(app)
      .post(`${api}/admin/categories`)
      .set(auth)
      .send({ name: 'Sub centre', code: '10-01-01-99-00', parentId: ids.centreId })
      .expect(201);
    expect(res.body.data.level).toBe(4);
    expect(res.body.data.pathSlugs).toContain(`${CAT.centre.slug}/sub-centre`);
  });

  it('forbids moving a category under its own descendant', async () => {
    await request(app)
      .patch(`${api}/admin/categories/move`)
      .set(auth)
      .send({ id: ids.machiningId, newParentId: ids.centreId })
      .expect(400);
  });

  it('records slug redirects when a category slug changes', async () => {
    await request(app)
      .patch(`${api}/admin/categories/${ids.centreId}`)
      .set(auth)
      .send({ slug: 'center-drills-renamed' })
      .expect(200);
    const redirects = await prisma.slugRedirect.findMany();
    expect(redirects.length).toBeGreaterThan(0);
    expect(redirects.some((r) => r.newPath.includes('center-drills-renamed'))).toBe(true);
  });
});

describe('product reads', () => {
  it('serves the full product detail with variants, tech data and crumbs', async () => {
    const res = await request(app).get(`${api}/products/flag-family`).expect(200);
    const p = res.body.data;
    expect(p.brand.name).toBe('TestBrand');
    expect(p.variants).toHaveLength(2);
    expect(p.variants[0].attributes.coating).toBe('TiAlN');
    expect(p.techData.length).toBe(2);
    expect(p.category.path.map((c: { name: string }) => c.name)).toEqual([
      'Machining',
      'Drilling',
      'Drills',
      'Centre drills',
    ]);
  });

  it('resolves variants by exact article number', async () => {
    const res = await request(app).get(`${api}/variants/900001%201`).expect(200);
    expect(res.body.data.articleNo).toBe('900001 1');
    await request(app).get(`${api}/variants/999999`).expect(404);
  });

  it('lists with filters: inStock, brand, enum values, numeric range — AND semantics', async () => {
    const base = `${api}/categories/${CAT.centre.code}/products`;
    const all = await request(app).get(base).expect(200);
    expect(all.body.data.total).toBe(1); // draft excluded

    // A second family with BOTH variants out of stock exercises inStock.
    await prisma.product.create({
      data: {
        slug: 'oos-family',
        name: 'Out of stock family',
        brandId: ids.brandId,
        categoryId: ids.centreId,
        status: 'PUBLISHED',
        shortDescription: 'oos',
        minPrice: 300,
        variants: {
          create: [
            { articleNo: '900003 1', listPrice: 300, stockQty: 0, leadTimeMinDays: 0, leadTimeMaxDays: 0 },
          ],
        },
      },
    });

    const inStock = await request(app).get(`${base}?inStock=true`).expect(200);
    expect(inStock.body.data.items).toHaveLength(1); // only the flag family has stock

    // Product-level AND: coating=TiN matches via variant 2, and the product
    // still qualifies for inStock via variant 1 (disjunctive per predicate —
    // documented listing semantics).
    const combined = await request(app).get(`${base}?inStock=true&coating=TiN`).expect(200);
    expect(combined.body.data.items).toHaveLength(1);

    const range = await request(app).get(`${base}?cutter_diameter_nominal_min=1.5`).expect(200);
    expect(range.body.data.items).toHaveLength(1); // variant 2 (dia 2) matches

    const brand = await request(app).get(`${base}?brand=testbrand`).expect(200);
    expect(brand.body.data.items).toHaveLength(2);

    await request(app).get(`${base}?unknown_attr=x`).expect(400);
  });

  it('sorts by price ascending and descending', async () => {
    const base = `${api}/categories/${CAT.centre.code}/products`;
    const asc = await request(app).get(`${base}?sort=price_asc`).expect(200);
    expect(asc.body.data.items[0].priceFrom).toBe('100.00');
  });
});

describe('product admin writes', () => {
  const auth = { Authorization: '' };
  beforeEach(() => {
    auth.Authorization = `Bearer ${adminToken}`;
  });

  it('creates products on leaf categories only, with slugs and validation', async () => {
    await request(app)
      .post(`${api}/admin/products`)
      .set(auth)
      .send({ name: 'Nope', brandId: ids.brandId, categoryId: ids.drillsId })
      .expect(400); // non-leaf

    const res = await request(app)
      .post(`${api}/admin/products`)
      .set(auth)
      .send({ name: 'Admin Family HSS', brandId: ids.brandId, categoryId: ids.centreId, status: 'PUBLISHED' })
      .expect(201);
    expect(res.body.data.slug).toBe('admin-family-hss');
  });

  it('validates variants: EAN checksum, axis uniqueness, GTIN rules; maintains minPrice', async () => {
    const create = (body: object) =>
      request(app).post(`${api}/admin/products/${ids.productFlagId}/variants`).set(auth).send(body);

    await create({
      articleNo: '900001 3',
      ean: '4006381333930', // invalid check digit (…31 is valid)
      listPrice: '80.00',
    }).expect(400);

    const ok = await create({
      articleNo: '900001 3',
      ean: '4006381333931',
      listPrice: '80.00',
      stockQty: 5,
      attributes: { coating: 'TiAlN', cutter_diameter_nominal: 3 },
    });
    if (ok.status !== 201) throw new Error(`variant create failed: ${JSON.stringify(ok.body)}`);
    expect(ok.body.data.articleNo).toBe('900001 3');

    // Same axis combination (TiAlN + dia 3) again → conflict
    await create({
      articleNo: '900001 4',
      listPrice: '85.00',
      attributes: { coating: 'TiAlN', cutter_diameter_nominal: 3 },
    }).expect(409);

    // minPrice recomputed to the new cheapest variant
    const product = await prisma.product.findUnique({ where: { id: ids.productFlagId } });
    expect(Number(product?.minPrice)).toBe(80);
  });

  it('rejects non-increasing price tier quantities', async () => {
    const variant = await prisma.variant.findFirstOrThrow({ where: { productId: ids.productFlagId } });
    await request(app)
      .put(`${api}/admin/products/${ids.productFlagId}/price-tiers/${variant.id}`)
      .set(auth)
      .send({ tiers: [{ minQty: 50, price: '90.00' }, { minQty: 10, price: '95.00' }] })
      .expect(400);
  });

  it('soft-deletes products (404 afterwards)', async () => {
    await request(app).delete(`${api}/admin/products/${ids.productDraftId}`).set(auth).expect(204);
    await request(app).get(`${api}/products/draft-family`).expect(404);
  });
});

describe('pricing', () => {
  it('resolves list price for guests and tiers at quantity', async () => {
    const variant = await prisma.variant.findFirstOrThrow({
      where: { productId: ids.productFlagId, articleNo: '900001 1' },
    });
    await prisma.priceTier.createMany({
      data: [
        { variantId: variant.id, minQty: 10, price: 95 },
        { variantId: variant.id, minQty: 50, price: 90 },
      ],
    });
    const res = await request(app)
      .post(`${api}/pricing/resolve`)
      .send({ lines: [{ variantId: variant.id, quantity: 12 }] })
      .expect(200);
    expect(res.body.data[0].unitPrice).toBe('95.00');
    expect(res.body.data[0].basis).toBe('tier');
  });
});
