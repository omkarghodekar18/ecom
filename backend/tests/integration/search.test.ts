// Search integration suite (spec Sections 9, 12, 6.5): ranked full-text
// listing with the exact-article fast path, visibility rules, listing filter
// semantics (identical to the category listing), autocomplete groups and the
// global filter set. Fixtures are created directly through Prisma; every
// assertion goes through the HTTP surface.
import { describe, beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { resetDb, disconnectDb } from '../helpers/reset-db.js';

let app: Express;
const api = '/api/v1';

const BRANDS = {
  main: { slug: 'testbrand', name: 'TestBrand' },
  other: { slug: 'searchtool', name: 'Searchtool' },
};
const CAT = {
  machining: { code: '10-00-00-00-00', slug: 'machining', name: 'Machining' },
  drilling: { code: '10-01-00-00-00', slug: 'drilling', name: 'Drilling' },
  drills: { code: '10-01-01-00-00', slug: 'drills', name: 'Drills' },
  centre: { code: '10-01-01-01-00', slug: 'centre-drills', name: 'Centre drills' },
};

/** GTIN-13 with a correct checksum (check digit 1) so the exact-EAN path is honest. */
const FLAG_V1_EAN = '4006381333931';

interface SeededIds {
  centreId: string;
  attrCoating: string;
  attrDiameter: string;
}



async function seedFixtures(): Promise<SeededIds> {
  const main = await prisma.brand.create({ data: BRANDS.main });
  const other = await prisma.brand.create({ data: BRANDS.other });
  const brandIdBySlug: Record<string, string> = {
    [BRANDS.main.slug]: main.id,
    [BRANDS.other.slug]: other.id,
  };
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
    data: { key: 'coating', label: 'Coating', groupName: 'Material', type: 'ENUM', enumValues: ['TiAlN', 'TiN'] },
  });
  const diameter = await prisma.attributeDefinition.create({
    data: { key: 'cutter_diameter', label: 'Diameter', groupName: 'Dimensions', type: 'NUMBER', unit: 'mm' },
  });
  await prisma.categoryAttribute.createMany({
    data: [
      { categoryId: centre.id, attributeId: coating.id, isFilterable: true, filterWidget: 'CHECKBOX', sortOrder: 1 },
      { categoryId: centre.id, attributeId: diameter.id, isFilterable: true, isVariantAxis: true, filterWidget: 'RANGE', sortOrder: 0 },
    ],
  });

  const product = (
    slug: string,
    name: string,
    brandSlug: string,
    status: 'PUBLISHED' | 'DRAFT',
    minPrice: number | null,
  ) =>
    prisma.product.create({
      data: {
        slug,
        name,
        brandId: brandIdBySlug[brandSlug]!,
        categoryId: centre.id,
        status,
        shortDescription: slug,
        ...(minPrice !== null ? { minPrice } : {}),
      },
    });

  const flag = await product('flag-family', 'Flag Family HSS TiAlN', BRANDS.main.slug, 'PUBLISHED', 100);
  const centre2 = await product('centre-drill-hss-g', 'Centre drill HSS-G TiN', BRANDS.other.slug, 'PUBLISHED', 90);
  await product('draft-family', 'Draft Family HSS', BRANDS.main.slug, 'DRAFT', null);

  const variant = (
    productId: string,
    articleNo: string,
    price: number,
    stock: number,
    coatingValue: string,
    dia: number,
    ean: string | null = null,
    leadTime: number | null = null,
  ) =>
    prisma.variant.create({
      data: {
        productId,
        articleNo,
        ...(ean !== null ? { ean } : {}),
        listPrice: price,
        stockQty: stock,
        ...(leadTime !== null ? { leadTimeMinDays: leadTime, leadTimeMaxDays: leadTime } : {}),
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

  await variant(flag.id, '900001 1', 100, 50, 'TiAlN', 1, FLAG_V1_EAN);
  await variant(flag.id, '900001 2', 120, 0, 'TiN', 2, null, 7);
  await variant(centre2.id, '900003 3', 90, 10, 'TiN', 3);
  await variant((await prisma.product.findUniqueOrThrow({ where: { slug: 'draft-family' } })).id, '900004 4', 90, 10, 'TiN', 4);

  await prisma.productImage.create({
    data: { productId: flag.id, publicId: 'img-flag-1', kind: 'PHOTO', alt: 'Flag', sortOrder: 0 },
  });

  return { centreId: centre.id, attrCoating: coating.id, attrDiameter: diameter.id };
}

beforeAll(async () => {
  app = createApp();
});

beforeEach(async () => {
  await resetDb();
  await seedFixtures();
});

afterAll(async () => {
  await disconnectDb();
});

interface SearchBody {
  items: Array<{ slug: string; name: string }>;
  facets: Array<{ key: string; values: Array<{ value: string; count: number }> }>;
  total: number;
  sort: string;
  exactArticleNo: string | null;
}

describe('GET /search', () => {
  it('finds products by name (FTS) with facets and pagination meta', async () => {
    const res = await request(app).get(`${api}/search`).query({ q: 'flag' }).expect(200);
    const data = res.body.data as SearchBody;
    expect(data.total).toBe(1);
    expect(data.items.map((i) => i.slug)).toEqual(['flag-family']);
    expect(data.exactArticleNo).toBeNull();
    expect(res.body.meta).toMatchObject({ page: 1, total: 1, totalPages: 1 });
    // Global facet source: coating (ENUM) mapped in the centre category.
    expect(data.facets.map((f) => f.key)).toContain('coating');
  });

  it('matches both HSS families but never the DRAFT product', async () => {
    const res = await request(app).get(`${api}/search`).query({ q: 'hss' }).expect(200);
    const data = res.body.data as SearchBody;
    expect(data.total).toBe(2);
    expect(data.items.map((i) => i.slug).sort()).toEqual(['centre-drill-hss-g', 'flag-family']);
  });

  it('surfaces the exact-article fast path (articleNo and EAN)', async () => {
    const byArticle = await request(app).get(`${api}/search`).query({ q: '900001 1' }).expect(200);
    expect((byArticle.body.data as SearchBody).exactArticleNo).toBe('900001 1');
    expect((byArticle.body.data as SearchBody).items.map((i: { slug: string }) => i.slug)).toContain('flag-family');

    const byEan = await request(app).get(`${api}/search`).query({ q: FLAG_V1_EAN }).expect(200);
    expect((byEan.body.data as SearchBody).exactArticleNo).toBe('900001 1');
    expect((byEan.body.data as SearchBody).items.map((i: { slug: string }) => i.slug)).toEqual(['flag-family']);
  });

  it('keeps the category listing filter semantics (brand, inStock, attributes)', async () => {
    // Attribute predicate: only products with a TiN variant survive.
    const tiN = await request(app).get(`${api}/search`).query({ q: 'hss', coating: 'TiN' }).expect(200);
    expect((tiN.body.data as SearchBody).total).toBe(2); // both families have a TiN variant

    const brand = await request(app).get(`${api}/search`).query({ q: 'hss', brand: BRANDS.other.slug }).expect(200);
    const brandData = brand.body.data as SearchBody;
    expect(brandData.total).toBe(1);
    expect(brandData.items[0]!.slug).toBe('centre-drill-hss-g');

    const inStock = await request(app).get(`${api}/search`).query({ q: 'hss', inStock: 'true' }).expect(200);
    // Both published families have an in-stock variant; the draft never appears.
    expect((inStock.body.data as SearchBody).total).toBe(2);

    const unknown = await request(app).get(`${api}/search`).query({ q: 'hss', no_such_key: 'x' }).expect(400);
    expect(unknown.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('honours non-relevance sorts (price_asc over the matched set)', async () => {
    const res = await request(app).get(`${api}/search`).query({ q: 'hss', sort: 'price_asc' }).expect(200);
    const data = res.body.data as SearchBody;
    expect(data.sort).toBe('price_asc');
    expect(data.items.map((i) => i.slug)).toEqual(['centre-drill-hss-g', 'flag-family']);
  });

  it('validates q (missing / too short / too long)', async () => {
    await request(app).get(`${api}/search`).expect(400);
    await request(app).get(`${api}/search`).query({ q: 'f' }).expect(400);
    await request(app).get(`${api}/search`).query({ q: 'x'.repeat(101) }).expect(400);
  });
});

describe('GET /search/suggest', () => {
  it('returns product, category and brand groups with resolved image', async () => {
    const res = await request(app).get(`${api}/search/suggest`).query({ q: 'centre' }).expect(200);
    const data = res.body.data as {
      products: Array<{ slug: string; articleNo: string | null; image: string | null; brandName: string }>;
      categories: Array<{ name: string; code: string }>;
      brands: Array<{ slug: string }>;
    };
    expect(data.products.map((p) => p.slug)).toEqual(['centre-drill-hss-g']);
    expect(data.products[0]!.brandName).toBe(BRANDS.other.name);
    expect(data.categories.map((c) => c.code)).toContain(CAT.centre.code);
    expect(data.brands).toEqual([]); // no brand name contains 'centre'
  });

  it('prefers the exact-matched articleNo and resolves the first image', async () => {
    const res = await request(app).get(`${api}/search/suggest`).query({ q: '900001 1' }).expect(200);
    const data = res.body.data as {
      products: Array<{ slug: string; articleNo: string | null; image: string | null }>;
    };
    expect(data.products[0]!.slug).toBe('flag-family');
    expect(data.products[0]!.articleNo).toBe('900001 1'); // exact match, not the first variant
    expect(data.products[0]!.image).toBe('/media/img-flag-1');
  });

  it('validates q like the listing endpoint', async () => {
    await request(app).get(`${api}/search/suggest`).expect(400);
    await request(app).get(`${api}/search/suggest`).query({ q: 'f' }).expect(400);
  });
});

describe('GET /search/filters', () => {
  it('serves the global filter set as CategoryAttributeDto rows', async () => {
    const res = await request(app).get(`${api}/search/filters`).expect(200);
    const data = res.body.data as Array<{ key: string; type: string; filterWidget: string; isFilterable: boolean }>;
    const keys = data.map((d) => d.key).sort();
    expect(keys).toEqual(['coating', 'cutter_diameter']);
    expect(data.every((d) => d.isFilterable)).toBe(true);
    const coating = data.find((d) => d.key === 'coating')!;
    expect(coating.type).toBe('ENUM');
    expect(coating.filterWidget).toBe('CHECKBOX');
  });
});
