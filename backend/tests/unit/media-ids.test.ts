// Unit tests: publicId validation (ADR 0012), the local adapter's traversal
// defence, and magic-byte sniffing. Pure filesystem/deterministic — no HTTP.
import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppError } from '../../src/common/errors/app-error.js';
import { LocalStorageAdapter } from '../../src/services/media/local-storage.adapter.js';
import { sniffMime } from '../../src/services/media/magic-bytes.util.js';
import { isValidPublicId } from '../../src/services/media/public-id.util.js';

describe('isValidPublicId', () => {
  it.each([
    ['catalog/products/ckx123/photo-1.svg', 'canonical product photo'],
    ['catalog/categories/drills', 'category image without extension'],
    ['catalog/documents/abc/datasheet.pdf', 'document under a subpath'],
    ['cms/banners/hero-1', 'CMS banner'],
    ['brands/acme-tools', 'brand logo'],
    ['imports/2026/w26/products.xlsx', 'import job file'],
    ['photo', 'bare basename'],
    ['foo..bar.png', 'double dot inside a segment is not traversal'],
  ])('accepts %s (%s)', (publicId) => {
    expect(isValidPublicId(publicId)).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['../etc/passwd', 'leading traversal'],
    ['catalog/../../etc/passwd', 'mid-path traversal'],
    ['..', 'dot-dot alone'],
    ['a/..', 'trailing dot-dot segment'],
    ['UPPER/case', 'uppercase'],
    ['catalog/héllo.svg', 'non-ascii'],
    ['catalog/with space.svg', 'space'],
    ['catalog/back\\slash', 'backslash'],
    ['catalog/semi;colon', 'stray punctuation'],
  ])('rejects %s (%s)', (publicId) => {
    expect(isValidPublicId(publicId)).toBe(false);
  });
});

describe('LocalStorageAdapter traversal defence', () => {
  const root = resolve(process.cwd(), 'var', 'unit-uploads');
  const adapter = new LocalStorageAdapter(root);
  const payload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('rejects writes that would escape the uploads root', async () => {
    await expect(adapter.write('../evil.svg', payload, 'image/svg+xml')).rejects.toBeInstanceOf(AppError);
    await expect(adapter.write('ok/../../evil.svg', payload, 'image/svg+xml')).rejects.toBeInstanceOf(AppError);
    await expect(adapter.write('..', payload, 'image/svg+xml')).rejects.toBeInstanceOf(AppError);
  });

  it('rejects reads and deletes with traversal ids', async () => {
    await expect(adapter.read('../etc/passwd')).rejects.toBeInstanceOf(AppError);
    await expect(adapter.delete('../../etc/passwd')).rejects.toBeInstanceOf(AppError);
  });

  it('round-trips bytes and derives the MIME type from the extension', async () => {
    await adapter.write('brands/acme/logo.svg', payload, 'image/svg+xml');
    const stored = await adapter.read('brands/acme/logo.svg');
    expect(stored?.data.equals(payload)).toBe(true);
    expect(stored?.mime).toBe('image/svg+xml');

    await adapter.write('catalog/documents/x/datasheet.pdf', Buffer.from('%PDF-1.7\n'), 'application/pdf');
    expect((await adapter.read('catalog/documents/x/datasheet.pdf'))?.mime).toBe('application/pdf');

    expect((await adapter.read('brands/acme/logo.png'))).toBeNull(); // never written
    expect(await adapter.exists('brands/acme/logo.svg')).toBe(true);
    expect(await adapter.exists('brands/acme/missing.svg')).toBe(false);
  });

  it('treats delete of a missing asset as a no-op', async () => {
    await expect(adapter.delete('brands/ghost/logo.svg')).resolves.toBeUndefined();
  });
});

describe('sniffMime', () => {
  it('recognizes the supported magic signatures', () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    expect(sniffMime(png)).toBe('image/png');

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    expect(sniffMime(jpeg)).toBe('image/jpeg');

    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0x00, 0x00, 0x00]), Buffer.from('WEBPVP8 ')]);
    expect(sniffMime(webp)).toBe('image/webp');

    const pdf = Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n');
    expect(sniffMime(pdf)).toBe('application/pdf');

    const svg = Buffer.from('  <?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(sniffMime(svg)).toBe('image/svg+xml');

    const svgWithBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('<svg xmlns="a"/>')]);
    expect(sniffMime(svgWithBom)).toBe('image/svg+xml');
  });

  it('rejects unknown or empty payloads', () => {
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
    expect(sniffMime(Buffer.from('<html><body>no svg here</body></html>'))).toBeNull();
    expect(sniffMime(Buffer.from('plain text, definitely not an image'))).toBeNull();
    expect(sniffMime(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });
});
