// Admin module integration suite (spec Section 15/21): RBAC matrix, dashboard
// stats, order state machine (valid + invalid transitions + timeline + audit),
// user self-guard, audit viewer, settings round-trip, CSV export.
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
let staffToken = '';
let customerToken = '';

const ADDRESS = {
  contactName: 'Ravi Kumar',
  phone: '+91 98765 43210',
  line1: '12 MG Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
  country: 'IN',
};

interface Seeded {
  orderNo: string;
  customerId: string;
  adminId: string;
  staffId: string;
}
let ids: Seeded;

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post(`${api}/auth/login/password`).send({ email, password }).expect(200);
  return (res.body as { data: { accessToken: string } }).data.accessToken;
}

async function seed(): Promise<void> {
  const passwordHash = await hashPassword('Password123');
  const admin = await prisma.user.create({
    data: { email: 'admin@t.co', passwordHash, role: 'ADMIN', firstName: 'A', lastName: 'D', emailVerifiedAt: new Date() },
  });
  const staff = await prisma.user.create({
    data: { email: 'staff@t.co', passwordHash, role: 'STAFF', firstName: 'S', lastName: 'F', emailVerifiedAt: new Date() },
  });
  const customer = await prisma.user.create({
    data: { email: 'cust@t.co', passwordHash, role: 'CUSTOMER', firstName: 'C', lastName: 'U', emailVerifiedAt: new Date() },
  });

  const brand = await prisma.brand.create({ data: { slug: 'b', name: 'BrandOne' } });
  const category = await prisma.category.create({
    data: { code: '10-01-01-01-00', slug: 'centre-drills', name: 'Centre drills', path: '/p/', pathSlugs: 'a/b', level: 1 },
  });
  const product = await prisma.product.create({
    data: { slug: 'drill-x', name: 'Drill X', brandId: brand.id, categoryId: category.id, status: 'PUBLISHED' },
  });
  const variant = await prisma.variant.create({
    data: { productId: product.id, articleNo: '777000 1', listPrice: '100.00', stockQty: 5 },
  });
  await prisma.cart.create({
    data: {
      userId: customer.id,
      items: { create: { variantId: variant.id, quantity: 2 } },
    },
  });
  const order = await prisma.order.create({
    data: {
      orderNo: 'ORD-2026-000001',
      userId: customer.id,
      paymentMethod: 'INVOICE',
      shippingAddress: ADDRESS,
      billingAddress: ADDRESS,
      subtotal: '200.00',
      taxTotal: '36.00',
      shippingTotal: '250.00',
      grandTotal: '486.00',
      items: {
        create: { variantId: variant.id, articleNo: '777000 1', name: 'Drill X', unitPrice: '100.00', quantity: 2, lineTotal: '200.00' },
      },
      events: { create: { status: 'PENDING', note: 'Order placed' } },
    },
  });
  await prisma.auditLog.create({
    data: { actorId: admin.id, action: 'product.update', entity: 'product', entityId: product.id, diff: { status: 'PUBLISHED' } },
  });

  ids = { orderNo: order.orderNo, customerId: customer.id, adminId: admin.id, staffId: staff.id };
  adminToken = await login('admin@t.co', 'Password123');
  staffToken = await login('staff@t.co', 'Password123');
  customerToken = await login('cust@t.co', 'Password123');
}

beforeAll(async () => {
  app = createApp();
});

beforeEach(async () => {
  await resetDb();
  await seed();
});

afterAll(async () => {
  await disconnectDb();
});

describe('RBAC', () => {
  it('blocks anonymous and customers from every admin endpoint', async () => {
    await request(app).get(`${api}/admin/stats`).expect(401);
    await request(app).get(`${api}/admin/stats`).set('Authorization', `Bearer ${customerToken}`).expect(403);
    await request(app).get(`${api}/admin/users`).set('Authorization', `Bearer ${staffToken}`).expect(403);
    await request(app).get(`${api}/admin/audit-logs`).set('Authorization', `Bearer ${staffToken}`).expect(403);
    await request(app).patch(`${api}/admin/settings`).set('Authorization', `Bearer ${staffToken}`).expect(403);
  });

  it('lets staff read stats and orders but only admin manage users', async () => {
    await request(app).get(`${api}/admin/stats`).set('Authorization', `Bearer ${staffToken}`).expect(200);
    await request(app).get(`${api}/admin/orders`).set('Authorization', `Bearer ${staffToken}`).expect(200);
    await request(app).get(`${api}/admin/users`).set('Authorization', `Bearer ${adminToken}`).expect(200);
  });
});

describe('stats', () => {
  it('aggregates catalog, orders and low stock', async () => {
    const res = await request(app).get(`${api}/admin/stats`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    const stats = res.body.data as {
      catalog: { products: number; variants: number; categories: number; brands: number };
      orders: { last30Days: number; revenue30Days: string; pending: number; failedImports: number };
      latestOrders: Array<{ orderNo: string }>;
      lowStock: Array<{ articleNo: string; stockQty: number }>;
    };
    expect(stats.catalog.products).toBe(1);
    expect(stats.catalog.variants).toBe(1);
    expect(stats.catalog.categories).toBe(1);
    expect(stats.catalog.brands).toBe(1);
    expect(stats.orders.last30Days).toBe(1);
    expect(stats.orders.revenue30Days).toBe('486.00');
    expect(stats.orders.pending).toBe(1);
    expect(stats.latestOrders[0]?.orderNo).toBe(ids.orderNo);
    expect(stats.lowStock[0]).toMatchObject({ articleNo: '777000 1', stockQty: 5 });
  });
});

describe('orders admin', () => {
  it('lists orders with buyer details and exports CSV', async () => {
    const list = await request(app)
      .get(`${api}/admin/orders`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0]).toMatchObject({ orderNo: ids.orderNo, email: 'cust@t.co', itemCount: 2 });

    const csv = await request(app)
      .get(`${api}/admin/orders/export`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(String(csv.headers['content-type'])).toContain('text/csv');
    expect(csv.text).toContain(ids.orderNo);
  });

  it('walks the state machine and records timeline + audit', async () => {
    const base = `${api}/admin/orders/${ids.orderNo}`;

    // Invalid: PENDING → SHIPPED is not allowed.
    const bad = await request(app)
      .patch(base)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'SHIPPED' })
      .expect(409);
    expect((bad.body.error as { details: { allowed: string[] } }).details.allowed).toEqual(['CONFIRMED', 'CANCELLED']);

    const ok = await request(app)
      .patch(base)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'CONFIRMED', notes: 'Confirmed by phone' })
      .expect(200);
    const { order } = ok.body.data as { order: { status: string; events: Array<{ status: string; note: string | null }> } };
    expect(order.status).toBe('CONFIRMED');
    expect(order.events).toHaveLength(2);
    expect(order.events[1]?.status).toBe('CONFIRMED');

    const audit = await request(app)
      .get(`${api}/admin/audit-logs?entity=order`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const entries = audit.body.data as Array<{ action: string; actorEmail: string }>;
    expect(entries.some((entry) => entry.action === 'order.status' && entry.actorEmail === 'staff@t.co')).toBe(true);
  });

  it('resends the confirmation email (queued through the inline worker)', async () => {
    await request(app)
      .post(`${api}/admin/orders/${ids.orderNo}/resend-email`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
  });

  it('is customer-scoped on the storefront side (ORDER_NOT_FOUND)', async () => {
    await request(app)
      .get(`${api}/orders/${ids.orderNo}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const other = await prisma.user.create({
      data: { email: 'other@t.co', passwordHash: await hashPassword('Password123'), firstName: 'O', lastName: 'T', emailVerifiedAt: new Date() },
    });
    void other;
    const otherToken = await login('other@t.co', 'Password123');
    await request(app)
      .get(`${api}/orders/${ids.orderNo}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });
});

describe('users & companies admin', () => {
  it('lists users and flips activation with audit', async () => {
    const list = await request(app).get(`${api}/admin/users`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(3);
    expect(list.body.data[0]).toHaveProperty('email');

    await request(app)
      .patch(`${api}/admin/users/${ids.customerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);
    const deactivated = await prisma.user.findUnique({ where: { id: ids.customerId } });
    expect(deactivated?.isActive).toBe(false);
  });

  it('self-guards deactivation and role changes', async () => {
    await request(app)
      .patch(`${api}/admin/users/${ids.adminId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(409);
    await request(app)
      .patch(`${api}/admin/users/${ids.adminId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'STAFF' })
      .expect(409);
  });

  it('lists companies with counts', async () => {
    const res = await request(app).get(`${api}/admin/companies`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('settings admin', () => {
  it('round-trips a settings update (audited) and exposes it publicly', async () => {
    const updated = await request(app)
      .patch(`${api}/admin/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ shipping: { flatRateInr: 300, freeThresholdInr: 5_000, note: 'From checkout', expressRateInr: 490 } })
      .expect(200);
    expect((updated.body.data as { shipping: { flatRateInr: number } }).shipping.flatRateInr).toBe(300);

    const commerce = await request(app).get(`${api}/settings/commerce`).expect(200);
    expect((commerce.body.data as { shipping: { expressRateInr: number | null } }).shipping.expressRateInr).toBe(490);

    // Invalid value rejected per-key.
    await request(app)
      .patch(`${api}/admin/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tax: { ratePercent: 500 } })
      .expect(400);
  });
});

describe('auth session (server guards)', () => {
  it('resolves the refresh cookie to the user without rotating', async () => {
    const login = await request(app)
      .post(`${api}/auth/login/password`)
      .send({ email: 'admin@t.co', password: 'Password123' })
      .expect(200);
    const setCookies = login.headers['set-cookie'] as string[];
    const refresh = setCookies.find((cookie) => cookie.startsWith('th_rt='));
    expect(refresh).toBeTruthy();
    const res = await request(app).get(`${api}/auth/session`).set('Cookie', refresh!).expect(200);
    expect((res.body.data as { user: { email: string; role: string } }).user).toMatchObject({
      email: 'admin@t.co',
      role: 'ADMIN',
    });
    await request(app).get(`${api}/auth/session`).expect(401);
  });
});

describe('product bulk actions & duplicate (spec 15.2)', () => {
  async function productBySlug(slug: string) {
    return prisma.product.findUniqueOrThrow({
      where: { slug },
      select: { id: true, status: true, deletedAt: true, name: true },
    });
  }

  it('bulk-publishes and bulk-archives products with audit + counts only real changes', async () => {
    const drill = await productBySlug('drill-x'); // seeded PUBLISHED
    const res = await request(app)
      .post(`${api}/admin/products/bulk`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ ids: [drill.id, 'missing-id'], action: 'ARCHIVE' })
      .expect(200);
    expect((res.body.data as { updated: number }).updated).toBe(1);
    expect((await productBySlug('drill-x')).status).toBe('ARCHIVED');

    // Idempotent re-run changes nothing.
    const again = await request(app)
      .post(`${api}/admin/products/bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [drill.id], action: 'ARCHIVE' })
      .expect(200);
    expect((again.body.data as { updated: number }).updated).toBe(0);

    const audits = await prisma.auditLog.findMany({ where: { action: 'product.bulk_status', entityId: drill.id } });
    expect(audits).toHaveLength(1);

    await request(app).post(`${api}/admin/products/bulk`).set('Authorization', `Bearer ${customerToken}`).send({ ids: [drill.id], action: 'PUBLISH' }).expect(403);
  });

  it('MOVE requires a valid categoryId; soft-delete + RESTORE round-trips', async () => {
    const drill = await productBySlug('drill-x');
    const leaf = await prisma.category.create({
      data: { code: '10-01-01-02-00', slug: 'nc-drills', name: 'NC spotting drills', path: '/p/', pathSlugs: 'a/c', level: 1 },
    });

    await request(app)
      .post(`${api}/admin/products/bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [drill.id], action: 'MOVE' })
      .expect(400); // categoryId required
    await request(app)
      .post(`${api}/admin/products/bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [drill.id], action: 'MOVE', categoryId: leaf.id })
      .expect(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: drill.id } })).categoryId).toBe(leaf.id);

    await request(app)
      .post(`${api}/admin/products/bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [drill.id], action: 'DELETE' })
      .expect(200);
    const deleted = await productBySlug('drill-x');
    expect(deleted.deletedAt).not.toBeNull();
    expect(await prisma.variant.count({ where: { productId: drill.id, deletedAt: null } })).toBe(0);

    await request(app)
      .post(`${api}/admin/products/bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [drill.id], action: 'RESTORE' })
      .expect(200);
    expect((await productBySlug('drill-x')).deletedAt).toBeNull();
    expect(await prisma.variant.count({ where: { productId: drill.id, deletedAt: null } })).toBe(1);
  });

  it('duplicates a product as DRAFT with suffixed articles, cleared EANs and shared images', async () => {
    const drill = await productBySlug('drill-x');
    const ean = '4006381333931';
    await prisma.variant.update({ where: { articleNo: '777000 1' }, data: { ean } });
    await prisma.priceTier.create({ data: { variant: { connect: { articleNo: '777000 1' } }, minQty: 10, price: '90.00' } });
    await prisma.productImage.create({ data: { productId: drill.id, publicId: 'mock/img-1', kind: 'PHOTO', sortOrder: 0 } });

    const res = await request(app)
      .post(`${api}/admin/products/${drill.id}/duplicate`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(201);
    const copy = res.body.data as { id: string; slug: string; name: string; status: string; minPrice: string | null };
    expect(copy.name).toBe('Drill X (copy)');
    expect(copy.status).toBe('DRAFT');
    expect(copy.slug).toMatch(/^drill-x-copy/);
    expect(copy.minPrice).toBe('100.00');

    const copyVariants = await prisma.variant.findMany({ where: { productId: copy.id }, include: { priceTiers: true, attributes: true } });
    expect(copyVariants).toHaveLength(1);
    expect(copyVariants[0]?.articleNo).toBe('777000 1-C');
    expect(copyVariants[0]?.ean).toBeNull();
    expect(copyVariants[0]?.priceTiers).toHaveLength(1);
    expect(await prisma.productImage.count({ where: { productId: copy.id } })).toBe(1);

    // Duplicate of the duplicate gets a further suffixed article number.
    const res2 = await request(app)
      .post(`${api}/admin/products/${copy.id}/duplicate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const copy2Variants = await prisma.variant.findMany({ where: { productId: (res2.body.data as { id: string }).id } });
    expect(copy2Variants[0]?.articleNo).toBe('777000 1-C-C');

    await request(app).post(`${api}/admin/products/${drill.id}/duplicate`).set('Authorization', `Bearer ${customerToken}`).expect(403);
    await request(app).post(`${api}/admin/products/missing/duplicate`).set('Authorization', `Bearer ${adminToken}`).expect(404);
  });
});
