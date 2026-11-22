// CMS + SEO integration suite (spec Sections 11, 13, 15, 22, 6.11).
// Fixtures are created directly through Prisma (banners in two placements
// including scheduled-out ones, a PUBLISHED page with all six block types plus
// an unknown one, a DRAFT page, category/product/brand rows for the sitemap);
// admin flows go through the API. Banner/CmsPage are not covered by resetDb,
// so this suite clears them (and the 'cms:' cache) itself.
import { describe, beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Prisma } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { hashPassword } from '../../src/common/utils/argon2.util.js';
import { cache } from '../../src/services/cache/index.js';
import { resetDb, disconnectDb } from '../helpers/reset-db.js';

let app: Express;
const api = '/api/v1';
let adminToken = '';
let customerToken = '';

const HOUR_MS = 3_600_000;

const CAT = {
  measuring: { code: '20-00-00-00-00', slug: 'measuring', name: 'Measuring' },
  workshop: { code: '30-00-00-00-00', slug: 'workshop', name: 'Workshop' },
  calipers: { code: '20-01-00-00-00', slug: 'calipers', name: 'Calipers' },
};

/** One block of each registry type + one unknown type that must be dropped. */
const PAGE_BLOCKS: Prisma.InputJsonValue = [
  {
    type: 'hero',
    eyebrow: 'Guides',
    heading: 'Test hero',
    subheading: 'Hero sub',
    ctaLabel: 'Go',
    ctaHref: '/in/en/e/test-page',
    imagePublicId: 'cms/banners/hero-1.svg',
  },
  { type: 'richText', html: '<p>Rich text body</p>' },
  {
    type: 'imageText',
    imagePublicId: 'cms/banners/side-1.svg',
    eyebrow: 'Image side',
    heading: 'Image & text',
    html: '<ul><li>one</li></ul>',
    side: 'right',
  },
  {
    type: 'cardGrid',
    cards: [
      { eyebrow: 'A', heading: 'Card A', html: '<p>a</p>', href: '/in/en/e/test-page' },
      { eyebrow: 'B', heading: 'Card B', html: '<p>b</p>' }, // seeded cards carry no href
    ],
  },
  { type: 'ctaBanner', heading: 'CTA head', subheading: 'CTA sub', ctaLabel: 'Click', ctaHref: '/in/en/contact' },
  { type: 'faq', items: [{ q: 'Question?', a: 'Answer.' }] },
  { type: 'legacyTeaser', heading: 'Unknown block type' }, // spec 6.11: dropped
];

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post(`${api}/auth/login/password`).send({ email, password }).expect(200);
  return (res.body as { data: { accessToken: string } }).data.accessToken;
}

async function seedFixtures(): Promise<void> {
  const brand = await prisma.brand.create({ data: { slug: 'testbrand', name: 'TestBrand' } });

  // Two root categories (level 0) + one child — only roots belong in the tiles.
  // Materialised paths are computed after create (the id is needed), like the
  // catalog suite.
  const measuring = await prisma.category.create({
    data: {
      ...CAT.measuring,
      path: 'pending',
      pathSlugs: CAT.measuring.slug,
      level: 0,
      sortOrder: 0,
      productCount: 7, // maintained column passes through to the tile
      imagePublicId: 'cms/tiles/measuring.svg',
    },
  });
  await prisma.category.update({ where: { id: measuring.id }, data: { path: `/${measuring.id}/` } });
  const workshop = await prisma.category.create({
    data: { ...CAT.workshop, path: 'pending', pathSlugs: CAT.workshop.slug, level: 0, sortOrder: 1 },
  });
  await prisma.category.update({ where: { id: workshop.id }, data: { path: `/${workshop.id}/` } });
  const calipers = await prisma.category.create({
    data: {
      ...CAT.calipers,
      parentId: measuring.id,
      path: 'pending',
      pathSlugs: `${CAT.measuring.slug}/${CAT.calipers.slug}`,
      level: 1,
      sortOrder: 0,
    },
  });
  await prisma.category.update({ where: { id: calipers.id }, data: { path: `/${measuring.id}/${calipers.id}/` } });

  // Sitemap URL seeds: the first visible variant (sortOrder 5) defines the suffix.
  await prisma.product.create({
    data: {
      slug: 'test-family',
      name: 'Test Family',
      brandId: brand.id,
      categoryId: calipers.id,
      status: 'PUBLISHED',
      variants: {
        create: [
          { articleNo: '111100 0,5', listPrice: 100, sortOrder: 5 },
          { articleNo: '111100 1', listPrice: 90, sortOrder: 10 },
        ],
      },
    },
  });
  await prisma.product.create({
    data: {
      slug: 'draft-family',
      name: 'Draft Family',
      brandId: brand.id,
      categoryId: calipers.id,
      status: 'DRAFT',
      variants: { create: [{ articleNo: '111199 1', listPrice: 80 }] },
    },
  });

  // Banners: two visible heroes (one windowed), one expired, one not-yet-started,
  // one side banner. The scheduled-out ones must never surface publicly.
  const now = Date.now();
  await prisma.banner.create({
    data: { placement: 'HOME_HERO', heading: 'Hero One', imagePublicId: 'cms/banners/test-hero-1.svg', sortOrder: 0 },
  });
  await prisma.banner.create({
    data: {
      placement: 'HOME_HERO',
      heading: 'Hero Two Windowed',
      imagePublicId: 'cms/banners/test-hero-2.svg',
      sortOrder: 1,
      startsAt: new Date(now - HOUR_MS),
      endsAt: new Date(now + HOUR_MS),
    },
  });
  await prisma.banner.create({
    data: {
      placement: 'HOME_HERO',
      heading: 'Hero Expired',
      imagePublicId: 'cms/banners/test-hero-expired.svg',
      sortOrder: 2,
      endsAt: new Date(now - HOUR_MS),
    },
  });
  await prisma.banner.create({
    data: {
      placement: 'HOME_HERO',
      heading: 'Hero Future',
      imagePublicId: 'cms/banners/test-hero-future.svg',
      sortOrder: 3,
      startsAt: new Date(now + HOUR_MS),
    },
  });
  await prisma.banner.create({
    data: { placement: 'HOME_SIDE_TOP', heading: 'Side Top One', imagePublicId: 'cms/banners/test-side-1.svg', sortOrder: 0 },
  });

  await prisma.cmsPage.create({
    data: {
      slug: 'test-page',
      title: 'Test Page',
      blocks: PAGE_BLOCKS,
      seoTitle: 'Test page SEO title',
      seoDescription: 'Test page SEO description.',
      status: 'PUBLISHED',
    },
  });
  await prisma.cmsPage.create({
    data: { slug: 'draft-page', title: 'Draft Page', blocks: [{ type: 'richText', html: '<p>x</p>' }], status: 'DRAFT' },
  });
}

beforeAll(async () => {
  app = createApp();
});

beforeEach(async () => {
  await resetDb();
  // resetDb does not know the CMS tables (later phase) — clear them here.
  await prisma.banner.deleteMany();
  await prisma.cmsPage.deleteMany();
  cache.deletePrefix('cms:');

  await prisma.user.create({
    data: {
      email: 'admin@t.example.com',
      passwordHash: await hashPassword('Admin123!secure'),
      role: 'ADMIN',
      firstName: 'A',
      lastName: 'B',
      emailVerifiedAt: new Date(),
    },
  });
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
  await seedFixtures();
  adminToken = await login('admin@t.example.com', 'Admin123!secure');
  customerToken = await login('cust@t.example.com', 'Customer123!secure');
});

afterAll(async () => {
  await disconnectDb();
});

describe('cms public reads', () => {
  it('composes the home payload: banners per placement, category tiles and SEO', async () => {
    const res = await request(app).get(`${api}/cms/home`).expect(200);
    const home = res.body.data as {
      heroes: Array<{ heading: string }>;
      sideTop: Array<{ heading: string }>;
      sideBottom: unknown[];
      highlights: unknown[];
      categoryTiles: Array<{
        name: string;
        slug: string;
        code: string;
        pathSlugs: string;
        productCount: number;
        image: string | null;
      }>;
      quickOrderTeaser: null;
      seoTitle: string;
      seoDescription: string;
    };

    expect(home.heroes.map((h) => h.heading)).toEqual(['Hero One', 'Hero Two Windowed']); // expired + future excluded
    expect(home.sideTop.map((h) => h.heading)).toEqual(['Side Top One']);
    expect(home.sideBottom).toEqual([]);
    expect(home.highlights).toEqual([]);
    expect(home.quickOrderTeaser).toBeNull();
    expect(home.seoTitle).toContain('ToolHub India');

    // Only the two level-0 categories, sortOrder-ordered; the child stays out.
    expect(home.categoryTiles.map((t) => t.name)).toEqual(['Measuring', 'Workshop']);
    expect(home.categoryTiles[0]).toMatchObject({
      slug: 'measuring',
      code: CAT.measuring.code,
      pathSlugs: 'measuring',
      productCount: 7,
      image: '/media/cms/tiles/measuring.svg',
    });
    expect(home.categoryTiles[1].image).toBeNull();

    // Cached now — a second hit must return the identical payload.
    const again = await request(app).get(`${api}/cms/home`).expect(200);
    expect(again.body.data).toEqual(res.body.data);
  });

  it('serves a published page with parsed blocks and drops the unknown block type', async () => {
    const res = await request(app).get(`${api}/cms/pages/test-page`).expect(200);
    const page = res.body.data as {
      slug: string;
      title: string;
      blocks: Array<{ type: string } & Record<string, unknown>>;
      seoTitle: string | null;
      seoDescription: string | null;
      updatedAt: string;
    };
    expect(page.slug).toBe('test-page');
    expect(page.seoTitle).toBe('Test page SEO title');
    expect(page.updatedAt).toEqual(expect.any(String));

    // Six registry blocks survive in order; legacyTeaser is silently dropped.
    expect(page.blocks).toHaveLength(6);
    expect(page.blocks.map((b) => b.type)).toEqual(['hero', 'richText', 'imageText', 'cardGrid', 'ctaBanner', 'faq']);
    expect(page.blocks.some((b) => b.type === 'legacyTeaser')).toBe(false);

    const cards = page.blocks[3].cards as Array<{ heading: string; href: string | null }>;
    expect(cards[0]).toMatchObject({ heading: 'Card A', href: '/in/en/e/test-page' });
    expect(cards[1]).toMatchObject({ heading: 'Card B', href: null }); // absent href normalised
  });

  it('hides draft and unknown pages behind 404 NOT_FOUND', async () => {
    const draft = await request(app).get(`${api}/cms/pages/draft-page`).expect(404);
    expect((draft.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    await request(app).get(`${api}/cms/pages/no-such-page`).expect(404);
  });

  it('lists banners by placement, window-filtered, with resolved image URLs', async () => {
    const res = await request(app).get(`${api}/banners?placement=HOME_HERO`).expect(200);
    const banners = res.body.data as Array<Record<string, unknown>>;
    expect(banners.map((b) => b.heading)).toEqual(['Hero One', 'Hero Two Windowed']);
    expect(banners.map((b) => b.sortOrder)).toEqual([0, 1]);
    expect(banners[0].image).toBe('/media/cms/banners/test-hero-1.svg');
    // The raw publicId never leaks into the public DTO.
    expect(banners[0].imagePublicId).toBeUndefined();
    expect(banners[0].id).toBeUndefined();

    await request(app)
      .get(`${api}/banners?placement=MENU_TEASER`)
      .expect(200)
      .expect((r) => {
        expect(r.body.data).toEqual([]);
      });
    await request(app).get(`${api}/banners?placement=BOGUS`).expect(400);
    await request(app).get(`${api}/banners`).expect(400);
  });
});

describe('cms admin writes', () => {
  const auth = { Authorization: '' };
  beforeEach(() => {
    auth.Authorization = `Bearer ${adminToken}`;
  });

  it('enforces RBAC on banner and page writes', async () => {
    const bannerBody = { placement: 'MENU_TEASER', heading: 'X', imagePublicId: 'cms/banners/x.svg' };
    await request(app).post(`${api}/admin/banners`).send(bannerBody).expect(401); // anonymous
    await request(app)
      .post(`${api}/admin/banners`)
      .set({ Authorization: `Bearer ${customerToken}` })
      .send(bannerBody)
      .expect(403); // customer
    await request(app)
      .post(`${api}/admin/cms/pages`)
      .set({ Authorization: `Bearer ${customerToken}` })
      .send({ slug: 'x', title: 'X', blocks: [] })
      .expect(403);
    await request(app).post(`${api}/admin/cms/pages`).send({ slug: 'x', title: 'X', blocks: [] }).expect(401);
  });

  it('runs banner create → patch → delete with audit and cms: cache invalidation', async () => {
    // Prime the home cache so the invalidation below is actually exercised.
    await request(app).get(`${api}/cms/home`).expect(200);

    const created = await request(app)
      .post(`${api}/admin/banners`)
      .set(auth)
      .send({
        placement: 'HOME_HERO',
        eyebrow: 'New',
        heading: 'Admin Hero',
        subheading: 'Fresh from the back office',
        ctaLabel: 'Shop',
        ctaHref: '/in/en/e/events',
        imagePublicId: 'cms/banners/admin-hero.svg',
        sortOrder: 5,
      })
      .expect(201);
    const banner = created.body.data as { id: string; image: string; placement: string };
    expect(banner.image).toBe('/media/cms/banners/admin-hero.svg');
    expect(banner.placement).toBe('HOME_HERO');

    // The cms: prefix was invalidated — the new hero is visible immediately.
    const home = await request(app).get(`${api}/cms/home`).expect(200);
    expect((home.body.data as { heroes: Array<{ heading: string }> }).heroes.map((h) => h.heading)).toContain(
      'Admin Hero',
    );

    const patched = await request(app)
      .patch(`${api}/admin/banners/${banner.id}`)
      .set(auth)
      .send({ heading: 'Admin Hero v2', startsAt: null, endsAt: null })
      .expect(200);
    expect((patched.body.data as { heading: string }).heading).toBe('Admin Hero v2');

    await request(app).delete(`${api}/admin/banners/${banner.id}`).set(auth).expect(204);
    await request(app).delete(`${api}/admin/banners/${banner.id}`).set(auth).expect(404);
    expect(await prisma.banner.count()).toBe(5); // only the fixtures remain

    const afterDelete = await request(app).get(`${api}/banners?placement=HOME_HERO`).expect(200);
    expect((afterDelete.body.data as Array<{ heading: string }>).map((b) => b.heading)).toEqual([
      'Hero One',
      'Hero Two Windowed',
    ]);

    // Audit trail: one row per write, entity 'banner'.
    const logs = await prisma.auditLog.findMany({ where: { entity: 'banner' } });
    expect(logs.map((l) => l.action).sort()).toEqual(['banner.create', 'banner.delete', 'banner.update']);
    const update = logs.find((l) => l.action === 'banner.update');
    expect(update).toBeDefined();
    expect((update?.diff as Record<string, { from: unknown; to: unknown }>).heading).toEqual({
      from: 'Admin Hero',
      to: 'Admin Hero v2',
    });
  });

  it('upserts CMS pages by slug, validates blocks and toggles status', async () => {
    // Prime the home cache; the 'home' page below must override the SEO defaults.
    const before = await request(app).get(`${api}/cms/home`).expect(200);
    expect((before.body.data as { seoTitle: string }).seoTitle).toBe(
      'ToolHub India — industrial tools for professionals',
    );

    const create = await request(app)
      .post(`${api}/admin/cms/pages`)
      .set(auth)
      .send({
        slug: 'Admin Page', // slugified on input
        title: 'Admin Page v1',
        blocks: [{ type: 'richText', html: '<p>v1</p>' }],
        status: 'PUBLISHED',
      })
      .expect(201);
    expect((create.body.data as { slug: string }).slug).toBe('admin-page');
    await request(app).get(`${api}/cms/pages/admin-page`).expect(200);

    const update = await request(app)
      .post(`${api}/admin/cms/pages`)
      .set(auth)
      .send({
        slug: 'admin-page',
        title: 'Admin Page v2',
        blocks: [
          { type: 'richText', html: '<p>v2</p>' },
          { type: 'faq', items: [{ q: 'Q', a: 'A' }] },
        ],
        status: 'PUBLISHED',
      })
      .expect(200); // upsert of an existing slug
    expect((update.body.data as { title: string }).title).toBe('Admin Page v2');
    const read = await request(app).get(`${api}/cms/pages/admin-page`).expect(200);
    expect((read.body.data as { blocks: unknown[] }).blocks).toHaveLength(2);

    // Registry violation on the write path → 400 (unknown types never enter via API).
    await request(app)
      .post(`${api}/admin/cms/pages`)
      .set(auth)
      .send({ slug: 'bad-page', title: 'Bad', blocks: [{ type: 'legacyTeaser', heading: 'x' }] })
      .expect(400);

    // A published 'home' page overrides the homepage SEO (and busts the cache).
    await request(app)
      .post(`${api}/admin/cms/pages`)
      .set(auth)
      .send({
        slug: 'home',
        title: 'Home SEO override',
        blocks: [],
        seoTitle: 'Custom home SEO',
        seoDescription: 'Custom home description.',
        status: 'PUBLISHED',
      })
      .expect(201);
    const homeAfter = await request(app).get(`${api}/cms/home`).expect(200);
    expect(homeAfter.body.data).toMatchObject({
      seoTitle: 'Custom home SEO',
      seoDescription: 'Custom home description.',
    });

    // PATCH by slug: draft hides the page immediately; unknown slug 404s.
    await request(app)
      .patch(`${api}/admin/cms/pages/admin-page`)
      .set(auth)
      .send({ status: 'DRAFT' })
      .expect(200);
    await request(app).get(`${api}/cms/pages/admin-page`).expect(404);
    await request(app)
      .patch(`${api}/admin/cms/pages/no-such-page`)
      .set(auth)
      .send({ title: 'X' })
      .expect(404);

    const pageLogs = await prisma.auditLog.findMany({ where: { entity: 'cms_page' } });
    expect(pageLogs.length).toBeGreaterThanOrEqual(3); // create + upsert-update + home create + patch
    expect(pageLogs.some((l) => l.action === 'cms_page.create')).toBe(true);
    expect(pageLogs.some((l) => l.action === 'cms_page.update')).toBe(true);
  });
});

describe('seo sitemap', () => {
  it('serves the sitemap index with totals for all four types', async () => {
    const res = await request(app).get(`${api}/seo/sitemap/index`).expect(200);
    const types = (res.body.data as { types: Array<{ type: string; totalPages: number }> }).types;
    expect(types.map((t) => t.type)).toEqual(['categories', 'products', 'brands', 'cms']);
    for (const t of types) expect(t.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('chunks categories as locale-prefixed category paths', async () => {
    const res = await request(app).get(`${api}/seo/sitemap/categories/1`).expect(200);
    const chunk = res.body.data as {
      type: string;
      page: number;
      totalPages: number;
      urls: Array<{ loc: string; updatedAt: string | null }>;
    };
    expect(chunk.type).toBe('categories');
    expect(chunk.page).toBe(1);
    expect(chunk.totalPages).toBe(1);
    const locs = chunk.urls.map((u) => u.loc);
    expect(locs).toContain('/in/en/measuring/c/20-00-00-00-00');
    expect(locs).toContain('/in/en/measuring/calipers/c/20-01-00-00-00'); // child is public too
    expect(locs).toContain('/in/en/workshop/c/30-00-00-00-00');
    const measuring = chunk.urls.find((u) => u.loc.includes('measuring/c/'));
    expect(measuring?.updatedAt).toEqual(expect.any(String));
  });

  it('chunks products with the slugified first article number', async () => {
    const res = await request(app).get(`${api}/seo/sitemap/products/1`).expect(200);
    const chunk = res.body.data as {
      type: string;
      totalPages: number;
      urls: Array<{ loc: string; updatedAt: string | null }>;
    };
    expect(chunk.type).toBe('products');
    expect(chunk.totalPages).toBe(1);
    const locs = chunk.urls.map((u) => u.loc);
    // First visible variant by sortOrder: '111100 0,5' → '111100-0-5'.
    expect(locs).toContain('/in/en/p/test-family-111100-0-5');
    expect(locs).not.toContain('/in/en/p/test-family-111100-1');
    expect(locs.some((l) => l.includes('draft-family'))).toBe(false); // DRAFT excluded
  });

  it('chunks brands and cms pages', async () => {
    const brands = await request(app).get(`${api}/seo/sitemap/brands/1`).expect(200);
    const brandUrls = (brands.body.data as { urls: Array<{ loc: string; updatedAt: string | null }> }).urls;
    expect(brandUrls.map((u) => u.loc)).toContain('/in/en/brands/testbrand');
    expect(brandUrls[0].updatedAt).toBeNull(); // Brand has no timestamps

    const cms = await request(app).get(`${api}/seo/sitemap/cms/1`).expect(200);
    const cmsUrls = (cms.body.data as { urls: Array<{ loc: string; updatedAt: string | null }> }).urls;
    expect(cmsUrls.map((u) => u.loc)).toContain('/in/en/e/test-page');
    expect(cmsUrls.some((u) => u.loc.includes('draft-page'))).toBe(false); // drafts never listed
    expect(cmsUrls[0].updatedAt).toEqual(expect.any(String));
  });

  it('validates type/page and 404s beyond the last chunk', async () => {
    await request(app).get(`${api}/seo/sitemap/bogus/1`).expect(400);
    await request(app).get(`${api}/seo/sitemap/categories/0`).expect(400);
    await request(app).get(`${api}/seo/sitemap/categories/-1`).expect(400);
    await request(app).get(`${api}/seo/sitemap/categories/99`).expect(404);
  });
});
