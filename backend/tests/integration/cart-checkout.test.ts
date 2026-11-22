// Cart + checkout + orders + quick-order integration suite (spec Sections
// 9/11/6.7/21): guest cart cookie flow, quantity rules, merge on login,
// server pricing (customer/tier/list), validate, one-transaction place-order
// (price re-validation, stock decrement, cart clear, order number, timeline),
// idempotency, IDOR-safe order reads, reorder, quick-order resolution.
import { describe, beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { hashPassword } from '../../src/common/utils/argon2.util.js';
import { settingsService } from '../../src/services/settings/index.js';
import { resetDb, disconnectDb } from '../helpers/reset-db.js';
import { readOtp } from '../helpers/read-otp.js';
import { createCookieJar } from '../helpers/cookies.js';

let app: Express;
const api = '/api/v1';

// ── fixtures ──────────────────────────────────────────────────────────────────

interface SeededIds {
  brandId: string;
  centreId: string;
  v1: string; // pack 5 / min 10 / stock 100 / list 100 / tier 20→90 / customer 80
  v2: string; // stock 0, lead 11–14, list 50
  v3: string; // draft product → not buyable
  b2bToken: string;
  b2bUserId: string;
  companyId: string;
  b2cToken: string;
}

let ids: SeededIds;

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post(`${api}/auth/login/password`).send({ email, password }).expect(200);
  return (res.body as { data: { accessToken: string } }).data.accessToken;
}

async function seed(): Promise<void> {
  const brand = await prisma.brand.create({ data: { slug: 'garaveta', name: 'Garaveta' } });
  const centre = await prisma.category.create({
    data: {
      code: '10-01-01-01-00',
      slug: 'centre-drills',
      name: 'Centre drills',
      path: '/p1/p2/p3/',
      pathSlugs: 'machining/drilling/drills/centre-drills',
      level: 3,
    },
  });

  const published = await prisma.product.create({
    data: {
      slug: 'centre-drill-hss',
      name: 'Centre drill HSS',
      brandId: brand.id,
      categoryId: centre.id,
      status: 'PUBLISHED',
    },
  });
  const draft = await prisma.product.create({
    data: { slug: 'draft-drill', name: 'Draft drill', brandId: brand.id, categoryId: centre.id, status: 'DRAFT' },
  });

  const v1 = await prisma.variant.create({
    data: {
      productId: published.id,
      articleNo: '111100 0,5',
      listPrice: '100.00',
      stockQty: 100,
      minOrderQty: 10,
      packSize: 5,
      priceTiers: { create: { minQty: 20, price: '90.00' } },
    },
  });
  const v2 = await prisma.variant.create({
    data: {
      productId: published.id,
      articleNo: '111100 5',
      listPrice: '50.00',
      stockQty: 0,
      leadTimeMinDays: 11,
      leadTimeMaxDays: 14,
    },
  });
  const v3 = await prisma.variant.create({
    data: { productId: draft.id, articleNo: '999000 1', listPrice: '10.00', stockQty: 5 },
  });

  // B2B user with company + customer price on v1 (80.00).
  const company = await prisma.company.create({ data: { name: 'Acme Tools', customerNumber: 'C-0001' } });
  const passwordHash = await hashPassword('Password123');
  const b2b = await prisma.user.create({
    data: {
      email: 'b2b@test.example.com',
      passwordHash,
      firstName: 'Ravi',
      lastName: 'Kumar',
      type: 'B2B',
      emailVerifiedAt: new Date(),
      companyId: company.id,
    },
  });
  await prisma.customerPrice.create({
    data: { companyId: company.id, variantId: v1.id, price: '80.00' },
  });
  const b2c = await prisma.user.create({
    data: {
      email: 'b2c@test.example.com',
      passwordHash,
      firstName: 'Guest',
      lastName: 'User',
      type: 'B2C',
      emailVerifiedAt: new Date(),
    },
  });
  void b2c;

  ids = {
    brandId: brand.id,
    centreId: centre.id,
    v1: v1.id,
    v2: v2.id,
    v3: v3.id,
    b2bToken: await login('b2b@test.example.com', 'Password123'),
    b2bUserId: b2b.id,
    companyId: company.id,
    b2cToken: await login('b2c@test.example.com', 'Password123'),
  };
}

interface CartEnvelope {
  data: {
    id: string | null;
    itemCount: number;
    items: Array<{ id: string; variantId: string; quantity: number; unitPrice: string; priceBasis: string; articleNo: string }>;
    totals: { subtotal: string; taxTotal: string; shippingTotal: string; grandTotal: string; taxRatePercent: number };
    warnings: Array<{ code: string; variantId: string | null }>;
  };
}

async function getCart(headers: Record<string, string>): Promise<CartEnvelope['data']> {
  const res = await request(app).get(`${api}/cart`).set(headers).expect(200);
  return (res.body as CartEnvelope).data;
}

const ADDRESS = {
  contactName: 'Ravi Kumar',
  phone: '+91 98765 43210',
  line1: '12 MG Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
  country: 'IN',
};

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

// ── guest cart ────────────────────────────────────────────────────────────────

describe('guest cart', () => {
  it('returns an empty cart without creating a row and without a cookie', async () => {
    const res = await request(app).get(`${api}/cart`).expect(200);
    const cart = (res.body as CartEnvelope).data;
    expect(cart.id).toBeNull();
    expect(cart.items).toEqual([]);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('adds a line, sets the th_cart cookie and applies min-order/pack rules', async () => {
    const res = await request(app)
      .post(`${api}/cart/items`)
      .send({ variantId: ids.v1, quantity: 3 })
      .expect(201);
    const cart = (res.body as CartEnvelope).data;
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.quantity).toBe(10); // min order 10
    expect(cart.items[0]?.unitPrice).toBe('100.00'); // guest → list price
    expect(cart.warnings.map((w) => w.code)).toContain('QTY_ADJUSTED_MIN_ORDER');

    const jar = createCookieJar();
    jar.absorb(res.headers['set-cookie']);
    expect(jar.get('th_cart')).toBeTruthy();
    expect(jar.get('th_cart')).toMatch(/^[0-9a-f]{48}$/);

    const again = await getCart({ Cookie: jar.header() });
    expect(again.id).not.toBeNull();
    expect(again.items[0]?.quantity).toBe(10);
  });

  it('sums quantities when the same variant is added again (with tier pricing)', async () => {
    const jar = createCookieJar();
    const first = await request(app).post(`${api}/cart/items`).send({ variantId: ids.v1, quantity: 10 });
    jar.absorb(first.headers['set-cookie']);
    await request(app)
      .post(`${api}/cart/items`)
      .set('Cookie', jar.header())
      .send({ variantId: ids.v1, quantity: 10 })
      .expect(201);
    const cart = await getCart({ Cookie: jar.header() });
    expect(cart.items[0]?.quantity).toBe(20);
    // quantity 20 ≥ tier 20 → 90.00 for a guest
    expect(cart.items[0]?.unitPrice).toBe('90.00');
    expect(cart.items[0]?.priceBasis).toBe('tier');
  });

  it('rejects unknown and draft variants', async () => {
    await request(app).post(`${api}/cart/items`).send({ variantId: 'nonexistent', quantity: 1 }).expect(404);
    await request(app).post(`${api}/cart/items`).send({ variantId: ids.v3, quantity: 1 }).expect(404);
  });

  it('patches quantity (pack rounding) and deletes a line', async () => {
    const jar = createCookieJar();
    const add = await request(app).post(`${api}/cart/items`).send({ variantId: ids.v1, quantity: 10 });
    jar.absorb(add.headers['set-cookie']);
    const itemId = ((add.body as CartEnvelope).data.items[0] ?? { id: '' }).id;

    const patched = await request(app)
      .patch(`${api}/cart/items/${itemId}`)
      .set('Cookie', jar.header())
      .send({ quantity: 7 })
      .expect(200);
    // 7 → pack 5 → 10
    expect((patched.body as CartEnvelope).data.items[0]?.quantity).toBe(10);

    await request(app).delete(`${api}/cart/items/${itemId}`).set('Cookie', jar.header()).expect(200);
    const cart = await getCart({ Cookie: jar.header() });
    expect(cart.items).toEqual([]);
  });

  it('cannot touch another cart\u2019s items (IDOR-safe)', async () => {
    const jarA = createCookieJar();
    const add = await request(app).post(`${api}/cart/items`).send({ variantId: ids.v1, quantity: 10 });
    jarA.absorb(add.headers['set-cookie']);
    const itemId = ((add.body as CartEnvelope).data.items[0] ?? { id: '' }).id;

    const jarB = createCookieJar();
    const addB = await request(app).post(`${api}/cart/items`).send({ variantId: ids.v2, quantity: 1 });
    jarB.absorb(addB.headers['set-cookie']);
    await request(app).patch(`${api}/cart/items/${itemId}`).set('Cookie', jarB.header()).send({ quantity: 1 }).expect(404);
  });
});

// ── merge on login ────────────────────────────────────────────────────────────

describe('cart merge on login', () => {
  it('merges the guest cart into the user cart and resolves customer prices', async () => {
    const jar = createCookieJar();
    const add = await request(app).post(`${api}/cart/items`).send({ variantId: ids.v1, quantity: 10 });
    jar.absorb(add.headers['set-cookie']);
    jar.absorb(undefined); // no-op

    const merged = await request(app)
      .post(`${api}/cart/merge`)
      .set('Authorization', `Bearer ${ids.b2bToken}`)
      .set('Cookie', jar.header())
      .expect(200);
    const cart = (merged.body as CartEnvelope).data;
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.unitPrice).toBe('80.00'); // company customer price
    expect(cart.items[0]?.priceBasis).toBe('customer');

    // Guest cart row is gone; the user cart persists without the cookie.
    const guestRow = await prisma.cart.count({ where: { anonymousToken: { not: null } } });
    expect(guestRow).toBe(0);
    const userCart = await getCart({ Authorization: `Bearer ${ids.b2bToken}` });
    expect(userCart.items[0]?.quantity).toBe(10);
  });

  it('requires authentication', async () => {
    await request(app).post(`${api}/cart/merge`).expect(401);
  });
});

// ── quick-order validation + import ───────────────────────────────────────────

describe('quick-order', () => {
  it('resolves dot and comma article numbers with rule-adjusted quantities', async () => {
    const res = await request(app)
      .post(`${api}/quick-order/validate`)
      .send({ lines: [{ articleNo: '111100 0.5', quantity: 3 }, { articleNo: '111100 5', quantity: 2 }, { articleNo: '000000 1', quantity: 1 }] })
      .expect(200);
    const results = res.body.data as Array<{
      articleNo: string;
      ok: boolean;
      variant: { productName: string; minOrderQty: number } | null;
      adjustedQuantity: number | null;
      error: { code: string } | null;
    }>;
    expect(results).toHaveLength(3);
    expect(results[0]?.ok).toBe(true);
    expect(results[0]?.adjustedQuantity).toBe(10);
    expect(results[1]?.ok).toBe(true);
    expect(results[2]?.ok).toBe(false);
    expect(results[2]?.error?.code).toBe('ARTICLE_NOT_FOUND');
  });

  it('import-csv adds valid lines and reports invalid ones', async () => {
    const res = await request(app)
      .post(`${api}/cart/import-csv`)
      .send({ lines: [{ articleNo: '111100 0,5', quantity: 10 }, { articleNo: '000000 9', quantity: 1 }] })
      .expect(200);
    const body = res.body.data as {
      cart: CartEnvelope['data'];
      results: Array<{ ok: boolean; error: { code: string } | null }>;
    };
    expect(body.results[0]?.ok).toBe(true);
    expect(body.results[1]?.error?.code).toBe('ARTICLE_NOT_FOUND');
    expect(body.cart.items).toHaveLength(1);
  });
});

// ── checkout ──────────────────────────────────────────────────────────────────

describe('checkout', () => {
  async function userCart(token: string, lines: Array<{ variantId: string; quantity: number }>): Promise<void> {
    await request(app)
      .post(`${api}/cart/items`)
      .set('Authorization', `Bearer ${token}`)
      .send(lines[0]!)
      .expect(201);
    for (const line of lines.slice(1)) {
      await request(app).post(`${api}/cart/items`).set('Authorization', `Bearer ${token}`).send(line).expect(201);
    }
  }

  it('validates and previews totals for a filled cart', async () => {
    await userCart(ids.b2bToken, [{ variantId: ids.v1, quantity: 10 }]);
    const res = await request(app)
      .post(`${api}/checkout/validate`)
      .set('Authorization', `Bearer ${ids.b2bToken}`)
      .send({ deliveryMethod: 'standard' })
      .expect(200);
    const data = res.body.data as { ok: boolean; itemCount: number; totals: { subtotal: string; grandTotal: string } };
    expect(data.ok).toBe(true);
    expect(data.itemCount).toBe(10);
    expect(data.totals.subtotal).toBe('800.00'); // customer price 80 × 10
    // tax 144 + shipping 250 → 1194.00
    expect(data.totals.grandTotal).toBe('1194.00');
  });

  it('flags express delivery as unavailable until configured', async () => {
    await userCart(ids.b2bToken, [{ variantId: ids.v1, quantity: 10 }]);
    const res = await request(app)
      .post(`${api}/checkout/validate`)
      .set('Authorization', `Bearer ${ids.b2bToken}`)
      .send({ deliveryMethod: 'express' })
      .expect(200);
    const data = res.body.data as { ok: boolean; issues: Array<{ code: string }> };
    expect(data.ok).toBe(false);
    expect(data.issues[0]?.code).toBe('DELIVERY_METHOD_UNAVAILABLE');

    await settingsService.updateSettings({ shipping: { flatRateInr: 250, freeThresholdInr: 10_000, note: 'x', expressRateInr: 490 } });
    const ok = await request(app)
      .post(`${api}/checkout/validate`)
      .set('Authorization', `Bearer ${ids.b2bToken}`)
      .send({ deliveryMethod: 'express' })
      .expect(200);
    expect((ok.body.data as { ok: boolean }).ok).toBe(true);
    await settingsService.updateSettings({ shipping: { flatRateInr: 250, freeThresholdInr: 10_000, note: 'x' } });
  });

  it('rejects RAZORPAY while the feature flag is off', async () => {
    await userCart(ids.b2bToken, [{ variantId: ids.v1, quantity: 10 }]);
    await request(app)
      .post(`${api}/checkout/place-order`)
      .set('Authorization', `Bearer ${ids.b2bToken}`)
      .send({ shippingAddress: ADDRESS, deliveryMethod: 'standard', paymentMethod: 'RAZORPAY' })
      .expect(400);
  });

  it('places an order atomically: snapshots, stock decrement, cart clear, timeline', async () => {
    await userCart(ids.b2bToken, [
      { variantId: ids.v1, quantity: 10 }, // customer 80 → 800
      { variantId: ids.v2, quantity: 5 }, // list 50 → 250 (backorder)
    ]);

    const res = await request(app)
      .post(`${api}/checkout/place-order`)
      .set('Authorization', `Bearer ${ids.b2bToken}`)
      .send({
        shippingAddress: ADDRESS,
        deliveryMethod: 'standard',
        paymentMethod: 'INVOICE',
        poNumber: 'PO-42',
        notes: 'Deliver to goods inward',
        idempotencyKey: 'test-idem-key-0001',
      })
      .expect(201);

    const order = res.body.data as {
      orderNo: string;
      status: string;
      paymentStatus: string;
      paymentMethod: string;
      poNumber: string;
      subtotal: string;
      taxTotal: string;
      shippingTotal: string;
      grandTotal: string;
      items: Array<{ articleNo: string; quantity: number; unitPrice: string }>;
      events: Array<{ status: string; note: string | null }>;
    };
    const year = new Date().getFullYear();
    expect(order.orderNo).toBe(`ORD-${year}-000001`);
    expect(order.status).toBe('PENDING');
    expect(order.paymentMethod).toBe('INVOICE');
    expect(order.poNumber).toBe('PO-42');
    expect(order.subtotal).toBe('1050.00');
    expect(order.taxTotal).toBe('189.00'); // 18% of 1050
    expect(order.shippingTotal).toBe('250.00');
    expect(order.grandTotal).toBe('1489.00');
    expect(order.items.map((item) => item.articleNo).sort()).toEqual(['111100 0,5', '111100 5']);
    expect(order.items[0]?.unitPrice).toBe('80.00'); // customer price snapshot
    expect(order.events[0]).toMatchObject({ status: 'PENDING', note: 'Order placed' });

    // Stock decremented (v2 goes negative: backorder).
    const v1 = await prisma.variant.findUnique({ where: { id: ids.v1 } });
    const v2 = await prisma.variant.findUnique({ where: { id: ids.v2 } });
    expect(v1?.stockQty).toBe(90);
    expect(v2?.stockQty).toBe(-5);

    // Cart cleared.
    const cart = await getCart({ Authorization: `Bearer ${ids.b2bToken}` });
    expect(cart.items).toEqual([]);

    // Confirmation email delivered through the inline queue (file outbox).
    // sanitizeEmail replaces '@' with '-' (see FileMailProvider).
    const { readdirSync, readFileSync, existsSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const outbox = resolve(process.cwd(), 'var/outbox');
    expect(existsSync(outbox)).toBe(true);
    const mail = readdirSync(outbox).find(
      (f) => f.includes('b2b-test.example.com') && f.includes('order-confirmation'),
    );
    expect(mail).toBeTruthy();
    expect(readFileSync(resolve(outbox, mail!), 'utf8')).toContain(order.orderNo);
  });

  it('replays idempotency keys with the original order', async () => {
    await userCart(ids.b2bToken, [{ variantId: ids.v1, quantity: 10 }]);
    const payload = {
      shippingAddress: ADDRESS,
      deliveryMethod: 'standard',
      paymentMethod: 'INVOICE',
      idempotencyKey: 'test-idem-key-0002',
    };
    const first = await request(app)
      .post(`${api}/checkout/place-order`)
      .set('Authorization', `Bearer ${ids.b2bToken}`)
      .send(payload)
      .expect(201);
    const replay = await request(app)
      .post(`${api}/checkout/place-order`)
      .set('Authorization', `Bearer ${ids.b2bToken}`)
      .send(payload)
      .expect(201);
    expect((replay.body.data as { orderNo: string }).orderNo).toBe((first.body.data as { orderNo: string }).orderNo);

    // A different user cannot reuse the key.
    await userCart(ids.b2cToken, [{ variantId: ids.v1, quantity: 10 }]);
    await request(app)
      .post(`${api}/checkout/place-order`)
      .set('Authorization', `Bearer ${ids.b2cToken}`)
      .send(payload)
      .expect(409);
  });

  it('enforces STOCK_ONLY at checkout (and at add-to-cart)', async () => {
    await settingsService.updateSettings({ stock: { policy: 'STOCK_ONLY' } });
    await request(app)
      .post(`${api}/cart/items`)
      .set('Authorization', `Bearer ${ids.b2bToken}`)
      .send({ variantId: ids.v2, quantity: 5 })
      .expect(409);

    await userCart(ids.b2bToken, [{ variantId: ids.v1, quantity: 10 }]);
    // Drop stock below the cart quantity, then place → rejected with issues.
    await prisma.variant.update({ where: { id: ids.v1 }, data: { stockQty: 3 } });
    const res = await request(app)
      .post(`${api}/checkout/place-order`)
      .set('Authorization', `Bearer ${ids.b2bToken}`)
      .send({ shippingAddress: ADDRESS, deliveryMethod: 'standard', paymentMethod: 'INVOICE' })
      .expect(409);
    const details = (res.body.error as { details: Array<{ code: string }> }).details;
    expect(details.some((d) => d.code === 'OUT_OF_STOCK')).toBe(true);
    await settingsService.updateSettings({ stock: { policy: 'ALLOW_BACKORDER' } });
  });

  it('rejects an empty cart', async () => {
    const res = await request(app)
      .post(`${api}/checkout/validate`)
      .set('Authorization', `Bearer ${ids.b2bToken}`)
      .send({})
      .expect(200);
    expect((res.body.data as { issues: Array<{ code: string }> }).issues[0]?.code).toBe('CART_EMPTY');
    await request(app)
      .post(`${api}/checkout/place-order`)
      .set('Authorization', `Bearer ${ids.b2bToken}`)
      .send({ shippingAddress: ADDRESS, deliveryMethod: 'standard', paymentMethod: 'INVOICE' })
      .expect(400);
  });
});

// ── order history ─────────────────────────────────────────────────────────────

describe('orders', () => {
  async function placeOrder(token: string): Promise<string> {
    await request(app)
      .post(`${api}/cart/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ variantId: ids.v1, quantity: 10 })
      .expect(201);
    const res = await request(app)
      .post(`${api}/checkout/place-order`)
      .set('Authorization', `Bearer ${token}`)
      .send({ shippingAddress: ADDRESS, deliveryMethod: 'standard', paymentMethod: 'INVOICE' })
      .expect(201);
    return (res.body.data as { orderNo: string }).orderNo;
  }

  it('lists and shows the order with its timeline (owner-scoped)', async () => {
    const orderNo = await placeOrder(ids.b2bToken);

    const list = await request(app).get(`${api}/orders`).set('Authorization', `Bearer ${ids.b2bToken}`).expect(200);
    const listBody = list.body as {
      data: Array<{ orderNo: string; itemCount: number; grandTotal: string; status: string }>;
      meta: { total: number };
    };
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0]).toMatchObject({ orderNo, itemCount: 10 });
    expect(listBody.meta.total).toBe(1);

    const detail = await request(app).get(`${api}/orders/${orderNo}`).set('Authorization', `Bearer ${ids.b2bToken}`).expect(200);
    const order = detail.body.data as { items: Array<{ articleNo: string }>; events: Array<{ status: string }> };
    expect(order.items).toHaveLength(1);
    expect(order.events[0]?.status).toBe('PENDING');

    // Another user cannot read it — ORDER_NOT_FOUND, no existence leak.
    await request(app).get(`${api}/orders/${orderNo}`).set('Authorization', `Bearer ${ids.b2cToken}`).expect(404);
    await request(app).get(`${api}/orders/${orderNo}`).expect(401);
  });

  it('reorders: all lines go back into the cart', async () => {
    const orderNo = await placeOrder(ids.b2bToken);
    const res = await request(app)
      .post(`${api}/orders/${orderNo}/reorder`)
      .set('Authorization', `Bearer ${ids.b2bToken}`)
      .expect(200);
    const cart = (res.body as CartEnvelope).data;
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.quantity).toBe(10);
    expect(cart.items[0]?.unitPrice).toBe('80.00');
  });
});

// ── registration OTP flow still works with the new modules mounted ───────────

describe('auth smoke (with commerce modules mounted)', () => {
  it('registers a B2C user and verifies via OTP', async () => {
    const email = 'shopper@test.example.com';
    await request(app)
      .post(`${api}/auth/register`)
      .send({ type: 'B2C', email, password: 'Password123', firstName: 'Neha', lastName: 'Patel' })
      .expect(202);
    const code = readOtp(email, 'REGISTER');
    await request(app).post(`${api}/auth/verify-email`).send({ email, code }).expect(200);
  });
});
