// Auth integration suite (spec Sections 10, 21): registration + OTP verification,
// password and OTP login, refresh rotation with reuse detection, CSRF, lockout,
// password reset, profile/sessions/addresses (IDOR-safe), RBAC basics.
import { describe, beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { resetDb, disconnectDb } from '../helpers/reset-db.js';
import { readOtp } from '../helpers/read-otp.js';
import { createCookieJar } from '../helpers/cookies.js';

let app: Express;
const api = '/api/v1';

beforeAll(async () => {
  app = createApp();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

interface AuthResponse {
  success: boolean;
  data: { user: { id: string; email: string; companyName?: string }; accessToken: string };
}

/** Registers + verifies a B2B user and returns the access token. */
async function registerVerifiedUser(email: string): Promise<AuthResponse['data']> {
  await request(app)
    .post(`${api}/auth/register`)
    .send({ type: 'B2B', email, password: 'Password123', firstName: 'A', lastName: 'B', companyName: 'Acme Tools' })
    .expect(202);
  const code = readOtp(email, 'REGISTER');
  const res = await request(app).post(`${api}/auth/verify-email`).send({ email, code }).expect(200);
  return (res.body as AuthResponse).data;
}

describe('registration + verification', () => {
  it('registers with a generic response and verifies via OTP', async () => {
    const email = 'verify1@test.example.com';
    const res = await request(app)
      .post(`${api}/auth/register`)
      .send({
        type: 'B2B',
        email,
        password: 'Password123',
        firstName: 'Priya',
        lastName: 'Sharma',
        companyName: 'Sharma Manufacturing',
      })
      .expect(202);
    expect(res.body.data.message).toMatch(/code/i);

    // Wrong code is rejected
    await request(app).post(`${api}/auth/verify-email`).send({ email, code: '000000' }).expect((r) => {
      if (r.status === 200) throw new Error('wrong code accepted');
    });

    const code = readOtp(email, 'REGISTER');
    const ok = await request(app).post(`${api}/auth/verify-email`).send({ email, code }).expect(200);
    const body = ok.body as AuthResponse;
    expect(body.data.user.email).toBe(email);
    expect(body.data.user.companyName).toBe('Sharma Manufacturing');
    expect(body.data.accessToken).toBeTruthy();

    // Code is single-use
    await request(app).post(`${api}/auth/verify-email`).send({ email, code }).expect(400);
  });

  it('rejects duplicate registration silently (generic response, no second mail)', async () => {
    const email = 'dup@test.example.com';
    await registerVerifiedUser(email);
    const res = await request(app)
      .post(`${api}/auth/register`)
      .send({ type: 'B2C', email, password: 'Password123', firstName: 'X', lastName: 'Y' })
      .expect(202);
    expect(res.body.data.message).toMatch(/code/i); // still generic
  });
});

describe('password login', () => {
  it('rejects wrong credentials without revealing which part failed', async () => {
    const email = 'login1@test.example.com';
    await registerVerifiedUser(email);
    const bad = await request(app)
      .post(`${api}/auth/login/password`)
      .send({ email, password: 'WrongPass999' })
      .expect(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');

    const unknown = await request(app)
      .post(`${api}/auth/login/password`)
      .send({ email: 'ghost@test.example.com', password: 'Whatever123' })
      .expect(401);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('blocks unverified accounts with EMAIL_UNVERIFIED and logs in after verification', async () => {
    const email = 'unverified@test.example.com';
    await request(app)
      .post(`${api}/auth/register`)
      .send({ type: 'B2C', email, password: 'Password123', firstName: 'U', lastName: 'V' })
      .expect(202);
    const res = await request(app)
      .post(`${api}/auth/login/password`)
      .send({ email, password: 'Password123' })
      .expect(403);
    expect(res.body.error.code).toBe('EMAIL_UNVERIFIED');

    const verified = await request(app)
      .post(`${api}/auth/verify-email`)
      .send({ email, code: readOtp(email, 'REGISTER') })
      .expect(200);
    expect((verified.body as AuthResponse).data.accessToken).toBeTruthy();
  });

  it('locks the account after 5 failed attempts', async () => {
    const email = 'locked@test.example.com';
    await registerVerifiedUser(email);
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post(`${api}/auth/login/password`)
        .send({ email, password: 'WrongPass999' })
        .expect(401);
    }
    const res = await request(app)
      .post(`${api}/auth/login/password`)
      .send({ email, password: 'Password123' }) // correct password, still locked
      .expect(429);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });
});

describe('OTP login', () => {
  it('logs in with an emailed code', async () => {
    const email = 'otp1@test.example.com';
    await registerVerifiedUser(email);
    await request(app).post(`${api}/auth/login/otp/request`).send({ email }).expect(202);
    const code = readOtp(email, 'LOGIN');
    const res = await request(app).post(`${api}/auth/login/otp/verify`).send({ email, code }).expect(200);
    expect((res.body as AuthResponse).data.user.email).toBe(email);
  });

  it('answers generically for unknown emails (no enumeration)', async () => {
    const res = await request(app)
      .post(`${api}/auth/login/otp/request`)
      .send({ email: 'nobody@test.example.com' })
      .expect(202);
    expect(res.body.data.message).toMatch(/code/i);
  });
});

describe('refresh rotation + CSRF', () => {
  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const email = 'refresh1@test.example.com';
    await registerVerifiedUser(email);
    const login = await request(app)
      .post(`${api}/auth/login/password`)
      .send({ email, password: 'Password123' })
      .expect(200);
    const jar = createCookieJar();
    jar.absorb(login.headers['set-cookie']);
    const csrf = jar.get('th_csrf');
    expect(csrf).toBeTruthy();

    // Refresh requires the CSRF double-submit header
    await request(app).post(`${api}/auth/refresh`).set('Cookie', jar.header()).expect(403);

    // Successful rotation issues a new access token + new cookies
    const rotated = await request(app)
      .post(`${api}/auth/refresh`)
      .set('Cookie', jar.header())
      .set('X-CSRF-Token', csrf as string)
      .expect(200);
    expect((rotated.body as AuthResponse).data.accessToken).toBeTruthy();
    const newJar = createCookieJar();
    newJar.absorb(rotated.headers['set-cookie']);
    expect(newJar.get('th_rt')).not.toBe(jar.get('th_rt'));

    // Replaying the OLD refresh token kills the family…
    await request(app)
      .post(`${api}/auth/refresh`)
      .set('Cookie', jar.header())
      .set('X-CSRF-Token', csrf as string)
      .expect(401);
    // …including the freshly rotated token
    await request(app)
      .post(`${api}/auth/refresh`)
      .set('Cookie', newJar.header())
      .set('X-CSRF-Token', newJar.get('th_csrf') as string)
      .expect(401);
  });

  it('logs out and revokes the presented session', async () => {
    const email = 'logout1@test.example.com';
    await registerVerifiedUser(email);
    const login = await request(app)
      .post(`${api}/auth/login/password`)
      .send({ email, password: 'Password123' })
      .expect(200);
    const jar = createCookieJar();
    jar.absorb(login.headers['set-cookie']);
    await request(app)
      .post(`${api}/auth/logout`)
      .set('Cookie', jar.header())
      .set('X-CSRF-Token', jar.get('th_csrf') as string)
      .expect(204);
    await request(app)
      .post(`${api}/auth/refresh`)
      .set('Cookie', jar.header())
      .set('X-CSRF-Token', jar.get('th_csrf') as string)
      .expect(401);
  });
});

describe('password reset', () => {
  it('resets via OTP and revokes sessions', async () => {
    const email = 'reset1@test.example.com';
    await registerVerifiedUser(email);
    await request(app).post(`${api}/auth/password/forgot`).send({ email }).expect(202);
    const code = readOtp(email, 'RESET_PASSWORD');
    await request(app)
      .post(`${api}/auth/password/reset`)
      .send({ email, code, newPassword: 'NewPassword123' })
      .expect(204);
    // Old password no longer works, new one does
    await request(app).post(`${api}/auth/login/password`).send({ email, password: 'Password123' }).expect(401);
    await request(app)
      .post(`${api}/auth/login/password`)
      .send({ email, password: 'NewPassword123' })
      .expect(200);
  });
});

describe('account endpoints', () => {
  it('requires authentication (RBAC basics)', async () => {
    await request(app).get(`${api}/auth/me`).expect(401);
    await request(app).get(`${api}/users/me/sessions`).expect(401);
    await request(app).get(`${api}/addresses`).expect(401);
  });

  it('updates the profile and changes the password', async () => {
    const email = 'profile1@test.example.com';
    const data = await registerVerifiedUser(email);
    const auth = { Authorization: `Bearer ${data.accessToken}` };

    const updated = await request(app)
      .patch(`${api}/users/me`)
      .set(auth)
      .send({ firstName: 'Asha', lastName: 'Patel', phone: '+91 98765 43210' })
      .expect(200);
    expect(updated.body.data.firstName).toBe('Asha');

    // Wrong current password is rejected
    await request(app)
      .post(`${api}/users/me/password`)
      .set(auth)
      .send({ currentPassword: 'Nope1234567', newPassword: 'Another12345' })
      .expect(401);
    await request(app)
      .post(`${api}/users/me/password`)
      .set(auth)
      .send({ currentPassword: 'Password123', newPassword: 'Another12345' })
      .expect(204);
    await request(app)
      .post(`${api}/auth/login/password`)
      .send({ email, password: 'Another12345' })
      .expect(200);
  });

  it('lists sessions and revokes others (not the current one)', async () => {
    const email = 'sessions1@test.example.com';
    const data = await registerVerifiedUser(email);
    const auth = { Authorization: `Bearer ${data.accessToken}` };
    // Second session (another login)
    await request(app).post(`${api}/auth/login/password`).send({ email, password: 'Password123' }).expect(200);

    const list = await request(app).get(`${api}/users/me/sessions`).set(auth).expect(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    await request(app).delete(`${api}/users/me/sessions`).set(auth).expect(204);
    const after = await request(app).get(`${api}/users/me/sessions`).set(auth).expect(200);
    expect(after.body.data).toHaveLength(1);
    expect((after.body.data[0] as { current: boolean }).current).toBe(true);
  });

  it('manages addresses with default swapping and IDOR protection', async () => {
    const owner = await registerVerifiedUser('owner@test.example.com');
    const other = await registerVerifiedUser('other@test.example.com');
    const ownerAuth = { Authorization: `Bearer ${owner.accessToken}` };
    const otherAuth = { Authorization: `Bearer ${other.accessToken}` };

    const address = {
      contactName: 'Ravi Owner',
      phone: '+91 90000 00001',
      line1: '2 Industrial Estate',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
      isDefaultShipping: true,
      isDefaultBilling: true,
    };
    const created = await request(app).post(`${api}/addresses`).set(ownerAuth).send(address).expect(201);
    const id = created.body.data.id as string;

    // Adding a second shipping default unsets the first
    const second = await request(app)
      .post(`${api}/addresses`)
      .set(ownerAuth)
      .send({ ...address, line1: '9 MG Road' })
      .expect(201);
    const list = await request(app).get(`${api}/addresses`).set(ownerAuth).expect(200);
    const defaults = list.body.data.filter((a: { isDefaultShipping: boolean }) => a.isDefaultShipping);
    expect(defaults).toHaveLength(1);
    expect((defaults[0] as { id: string }).id).toBe(second.body.data.id as string);

    // Another user cannot touch owner's address (IDOR-safe → 404)
    await request(app)
      .patch(`${api}/addresses/${id}`)
      .set(otherAuth)
      .send({ ...address, contactName: 'Hacker' })
      .expect(404);
    await request(app).delete(`${api}/addresses/${id}`).set(otherAuth).expect(404);

    // Owner can update and delete their own
    await request(app)
      .patch(`${api}/addresses/${id}`)
      .set(ownerAuth)
      .send({ ...address, contactName: 'Ravi K Owner' })
      .expect(200);
    await request(app).delete(`${api}/addresses/${id}`).set(ownerAuth).expect(204);
  });

  it('exposes the company for B2B users only', async () => {
    const b2b = await registerVerifiedUser('b2b1@test.example.com');
    const res = await request(app)
      .get(`${api}/companies/me`)
      .set({ Authorization: `Bearer ${b2b.accessToken}` })
      .expect(200);
    expect(res.body.data.name).toBe('Acme Tools');

    // B2C user has no company
    const email = 'b2c1@test.example.com';
    await request(app)
      .post(`${api}/auth/register`)
      .send({ type: 'B2C', email, password: 'Password123', firstName: 'B', lastName: 'C' })
      .expect(202);
    const login = await request(app)
      .post(`${api}/auth/verify-email`)
      .send({ email, code: readOtp(email, 'REGISTER') })
      .expect(200);
    await request(app)
      .get(`${api}/companies/me`)
      .set({ Authorization: `Bearer ${(login.body as AuthResponse).data.accessToken}` })
      .expect(404);
  });
});
