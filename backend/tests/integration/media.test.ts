// Media integration suite (ADR 0012, spec Sections 14/18): public delivery
// from the local adapter with immutable caching, publicId traversal safety,
// signed admin uploads and provider-agnostic binary intake. The routers are
// mounted on a purpose-built app exactly like app.ts would mount them
// (public at /media, admin under /api/v1/admin/media). Auth is exercised
// with locally minted JWTs (authenticate is stateless by design), so no DB
// rows are needed.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import type { IncomingMessage } from 'node:http';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { errorHandler } from '../../src/common/errors/error-handler.js';
import { notFoundHandler } from '../../src/common/middleware/not-found.js';
import { logger } from '../../src/config/logger.js';
import { API_PREFIX } from '../../src/config/constants.js';
import { signAccessToken } from '../../src/common/utils/jwt.util.js';
import { mediaAdminRouter, mediaPublicRouter } from '../../src/modules/media/index.js';
import { getStorageAdapter, mediaService, type LocalStorageAdapter } from '../../src/services/media/index.js';

const adminMedia = `${API_PREFIX}/admin/media`;
const uploadsRoot = resolve(process.cwd(), 'var', 'uploads');
const varRoot = resolve(process.cwd(), 'var');
/** Canary OUTSIDE the uploads root — must never be served via /media. */
const escapeCanary = resolve(varRoot, 'media-escape-canary.txt');

let app: Express;

const staffToken = signAccessToken({ id: 'user_media_staff', role: 'STAFF', type: 'B2C' }, 'media-test-staff');
const customerToken = signAccessToken({ id: 'user_media_customer', role: 'CUSTOMER', type: 'B2C' }, 'media-test-customer');
const asStaff = { Authorization: `Bearer ${staffToken}` };
const asCustomer = { Authorization: `Bearer ${customerToken}` };

/** 1x1 transparent PNG (valid magic bytes + IEND). */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const SVG_BADGE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#588"/></svg>';

beforeAll(() => {
  app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/media', mediaPublicRouter);
  app.use(adminMedia, mediaAdminRouter);
  app.use(notFoundHandler);
  app.use(errorHandler(logger) as unknown as express.ErrorRequestHandler);
});

beforeEach(() => {
  rmSync(uploadsRoot, { recursive: true, force: true });
  mkdirSync(varRoot, { recursive: true });
  writeFileSync(escapeCanary, 'top secret — must not be reachable through /media');
});

afterAll(() => {
  rmSync(uploadsRoot, { recursive: true, force: true });
  rmSync(escapeCanary, { force: true });
});

/** GETs raw bytes (supertest's default parsers ignore binary media types). */
function rawGet(path: string): Promise<{ status: number; body: Buffer; etag: string | undefined }> {
  return new Promise((resolveResponse, reject) => {
    request(app)
      .get(path)
      .parse((res: IncomingMessage, fn: (err: Error | null, result?: unknown) => void) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => fn(null, Buffer.concat(chunks)));
      })
      .end((err, res) => {
        if (err) reject(err);
        else
          resolveResponse({
            status: res.status,
            body: res.body as Buffer,
            etag: (res.headers.etag as string | undefined) ?? undefined,
          });
      });
  });
}

describe('GET /media/<publicId> (local adapter delivery)', () => {
  it('serves a generated placeholder with immutable caching and ETag revalidation', async () => {
    await mediaService.savePlaceholderImage('catalog/products/x/photo-1.svg', 'Centre drill');

    const first = await rawGet('/media/catalog/products/x/photo-1.svg');
    expect(first.status).toBe(200);
    const svg = first.body.toString('utf-8');
    expect(first.etag).toMatch(/^"[0-9a-f]{40}"$/);
    expect(svg).toContain('Centre drill');
    expect(svg).toContain('ToolHub India');
    expect(svg.startsWith('<svg')).toBe(true);

    const withHeaders = await request(app).get('/media/catalog/products/x/photo-1.svg').expect(200);
    expect(withHeaders.headers['content-type']).toBe('image/svg+xml');
    expect(withHeaders.headers['cache-control']).toBe('public, max-age=31536000, immutable');

    await request(app)
      .get('/media/catalog/products/x/photo-1.svg')
      .set('If-None-Match', first.etag as string)
      .expect(304)
      .expect((res) => {
        if (Object.keys(res.body).length > 0) throw new Error('304 must have an empty body');
      });
  });

  it('generates deterministic placeholder bytes for the same label', async () => {
    const adapter = getStorageAdapter() as LocalStorageAdapter;
    await mediaService.savePlaceholderImage('catalog/products/d/photo.svg', 'End mill 8mm');
    const first = await adapter.read('catalog/products/d/photo.svg');
    await mediaService.savePlaceholderImage('catalog/products/d/photo.svg', 'End mill 8mm');
    const second = await adapter.read('catalog/products/d/photo.svg');
    expect(first?.data.equals(second?.data)).toBe(true);
  });

  it('serves a stored PNG with its derived content type', async () => {
    const adapter = getStorageAdapter() as LocalStorageAdapter;
    await adapter.write('catalog/products/x/photo-1.png', PNG_1X1, 'image/png');

    const served = await rawGet('/media/catalog/products/x/photo-1.png');
    expect(served.status).toBe(200);
    expect(served.body.equals(PNG_1X1)).toBe(true);
    const head = await request(app).get('/media/catalog/products/x/photo-1.png').expect(200);
    expect(head.headers['content-type']).toBe('image/png');
  });

  it('404s cleanly for missing assets', async () => {
    const missing = await request(app).get('/media/missing/file.svg').expect(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  it('404s traversal attempts instead of escaping the uploads root', async () => {
    await request(app).get('/media/../../etc/passwd').expect(404);
    await request(app).get('/media/%2e%2e/%2e%2e/etc/passwd').expect(404);
    await request(app).get('/media/..%2f..%2fetc/passwd').expect(404);
    await request(app).get('/media/catalog/%2e%2e/%2e%2e/etc/passwd').expect(404);
    await request(app).get('/media/..%2fmedia-escape-canary.txt').expect(404);
    // The canary outside the uploads root must be untouched and unreachable.
    const probe = await request(app).get('/media/%2e%2e/media-escape-canary.txt').expect(404);
    expect(probe.body.error.code).toBe('NOT_FOUND');
  });

  it('404s malformed percent-escapes instead of erroring', async () => {
    await request(app).get('/media/%').expect(404);
    await request(app).get('/media/foo%zz.png').expect(404);
  });
});

describe('POST /admin/media/sign-upload', () => {
  const sign = (body: Record<string, unknown>) =>
    request(app).post(`${adminMedia}/sign-upload`).set(asStaff).send(body);

  it('requires authentication', async () => {
    await request(app)
      .post(`${adminMedia}/sign-upload`)
      .send({ folder: 'catalog/products/test/', resourceType: 'image' })
      .expect(401);
  });

  it('rejects roles below STAFF', async () => {
    await request(app)
      .post(`${adminMedia}/sign-upload`)
      .set(asCustomer)
      .send({ folder: 'catalog/products/test/', resourceType: 'image' })
      .expect(403);
  });

  it('returns a local ticket with the derived publicId', async () => {
    const res = await sign({
      folder: 'catalog/products/test/',
      resourceType: 'image',
      filename: 'Photo 1.PNG',
      mime: 'image/png',
    }).expect(200);
    expect(res.body.data).toEqual({
      adapter: 'local',
      uploadUrl: '/api/v1/admin/media/upload',
      fields: { publicId: 'catalog/products/test/photo-1.png' },
    });
  });

  it('accepts folders without trailing slash and generates basenames when omitted', async () => {
    const res = await sign({ folder: 'catalog/products/test', resourceType: 'image', mime: 'image/png' }).expect(200);
    expect(res.body.data.fields.publicId).toMatch(/^catalog\/products\/test\/asset-[a-z0-9-]+\.png$/);
  });

  it('rejects folders outside the allow-list or containing traversal', async () => {
    for (const folder of ['users/avatars/', 'products/', 'catalog/products/../etc/', '../etc/']) {
      const res = await sign({ folder, resourceType: 'image' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects mimes inconsistent with the resourceType', async () => {
    await sign({ folder: 'catalog/documents/test/', resourceType: 'raw', mime: 'image/png' }).expect(400);
    await sign({ folder: 'catalog/products/test/', resourceType: 'image', mime: 'application/pdf' }).expect(400);
    await sign({ folder: 'catalog/products/test/', resourceType: 'image', mime: 'application/x-msdownload' }).expect(400);
  });
});

describe('POST /admin/media/upload (binary intake)', () => {
  const upload = (publicId: string, body: Buffer | string, contentType: string, extra: Record<string, string> = {}) =>
    request(app)
      .post(`${adminMedia}/upload`)
      .set(asStaff)
      .set('Content-Type', contentType)
      .set('x-public-id', publicId)
      .set(extra)
      .send(body);

  it('requires authentication', async () => {
    await request(app)
      .post(`${adminMedia}/upload`)
      .set('Content-Type', 'image/png')
      .set('x-public-id', 'catalog/products/test/a.png')
      .send(PNG_1X1)
      .expect(401);
  });

  it('stores a signed PNG upload and serves it back through /media', async () => {
    const signed = await request(app)
      .post(`${adminMedia}/sign-upload`)
      .set(asStaff)
      .send({ folder: 'catalog/products/test/', resourceType: 'image', filename: 'photo-1.png', mime: 'image/png' })
      .expect(200);
    const publicId = signed.body.data.fields.publicId as string;
    expect(publicId).toBe('catalog/products/test/photo-1.png');

    const stored = await upload(publicId, PNG_1X1, 'image/png').expect(200);
    expect(stored.body.data).toEqual({ publicId, url: `/media/${publicId}` });

    const served = await rawGet(`/media/${publicId}`);
    expect(served.status).toBe(200);
    expect(served.body.equals(PNG_1X1)).toBe(true);
  });

  it('accepts SVG uploads and verifies them by magic bytes', async () => {
    const publicId = 'cms/banners/test/icon-1.svg';
    const stored = await upload(publicId, SVG_BADGE, 'image/svg+xml').expect(200);
    expect(stored.body.data.url).toBe(`/media/${publicId}`);
    const served = await rawGet(`/media/${publicId}`);
    expect(served.body.toString('utf-8')).toContain('<svg');
  });

  it('rejects a publicId outside the allowed folders', async () => {
    const res = await upload('evil/photos/a.png', PNG_1X1, 'image/png').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a missing x-public-id header', async () => {
    await request(app).post(`${adminMedia}/upload`).set(asStaff).set('Content-Type', 'image/png').send(PNG_1X1).expect(400);
  });

  it('rejects payloads whose magic bytes contradict the declared type', async () => {
    await upload('catalog/products/test/fake.png', '<html><body>not a png</body></html>', 'image/png').expect(400);
    await upload('catalog/products/test/fake.png', SVG_BADGE, 'image/png').expect(400);
  });

  it('rejects publicIds whose extension contradicts the content', async () => {
    await upload('catalog/products/test/icon.svg', PNG_1X1, 'image/png').expect(400);
  });

  it('rejects undeclared or unsupported media types', async () => {
    await upload('catalog/products/test/a.txt', 'plain text', 'text/plain').expect(400);
  });

  it('rejects bodies over the 10MB cap with 413', async () => {
    const huge = Buffer.concat([PNG_1X1, Buffer.alloc(10 * 1024 * 1024, 0)]);
    await upload('catalog/products/test/huge.png', huge, 'image/png').expect(413);
  });

  it('rejects roles below STAFF', async () => {
    await request(app)
      .post(`${adminMedia}/upload`)
      .set(asCustomer)
      .set('Content-Type', 'image/png')
      .set('x-public-id', 'catalog/products/test/a.png')
      .send(PNG_1X1)
      .expect(403);
  });
});
