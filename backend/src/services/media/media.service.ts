// Media service (spec Section 14, ADR 0012): the single entry point other
// modules use for media — placeholder SVGs (seed/imports), SSRF-safe
// upload-from-URL (imports of manufacturer images) and asset lifecycle —
// all delegated to the configured StorageAdapter. publicIds are the only
// persisted reference; URLs are resolved per-request.
import { randomBytes } from 'node:crypto';
import { AppError, badRequest } from '../../common/errors/app-error.js';
import { ERR } from '../../config/constants.js';
import { getEnv } from '../../config/env.js';
import { CloudinaryStorageAdapter } from './cloudinary-storage.adapter.js';
import { LocalStorageAdapter } from './local-storage.adapter.js';
import { isSafeHost } from './ip.guard.js';
import { sniffMime } from './magic-bytes.util.js';
import { createMediaUrlBuilder, mediaUrls } from './media-url.builder.js';
import type { MediaResourceKind, MediaUrlBuilder, StorageAdapter } from './media.types.js';
import { normalizeMime } from './mime.util.js';
import { assertValidPublicId, isValidPublicId } from './public-id.util.js';

/** Hard upload cap shared by remote fetches and the binary admin endpoint. */
export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Remote fetch budget (connect+read via AbortController). */
const REMOTE_FETCH_TIMEOUT_MS = 15_000;
/** Redirect hops allowed while fetching a remote asset (each re-validated). */
const MAX_REDIRECTS = 3;

export interface PlaceholderStyle {
  bg?: string;
  fg?: string;
}

export interface UploadFromUrlOptions {
  maxBytes?: number;
  allowedMimes?: readonly string[];
}

/* ------------------------------- SVG ------------------------------------ */

const SVG_FONT_STACK = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const XML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => XML_ENTITIES[ch] ?? ch);
}

/**
 * 800×600 placeholder (spec Section 14 / ADR 0012): light grey background,
 * a stroke-only tool glyph, the item label and a small footer — all inline
 * SVG with system fonts, so seed data renders identically on every adapter.
 * Pure string rendering: same label → byte-identical output.
 */
export function renderPlaceholderSvg(label: string, style: PlaceholderStyle = {}): string {
  const bg = escapeXml(style.bg ?? '#F2F2F2');
  const fg = escapeXml(style.fg ?? '#6B7280');
  const text = escapeXml(label.trim().slice(0, 48)) || 'Tool';
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" role="img" aria-label="ToolHub placeholder image">',
    `<rect width="800" height="600" fill="${bg}"/>`,
    `<g transform="translate(316 166) scale(7)" fill="none" stroke="${fg}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" opacity="0.7">`,
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    '</g>',
    `<text x="400" y="476" text-anchor="middle" font-family="${SVG_FONT_STACK}" font-size="34" font-weight="600" fill="${fg}">${text}</text>`,
    `<text x="400" y="564" text-anchor="middle" font-family="${SVG_FONT_STACK}" font-size="20" fill="${fg}" opacity="0.65">ToolHub India</text>`,
    '</svg>',
  ].join('');
}

/* ---------------------------- remote fetch ------------------------------ */

/** SSRF gate (spec Section 18): https-only, no credentials, public hosts. */
async function assertFetchableUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest(`Invalid remote URL: ${JSON.stringify(raw)}`);
  }
  if (url.protocol !== 'https:') {
    throw new AppError(ERR.UNSAFE_URL, 'Only https: URLs may be fetched', 400);
  }
  if (url.username || url.password) {
    throw new AppError(ERR.UNSAFE_URL, 'URLs with embedded credentials are not allowed', 400);
  }
  if (!(await isSafeHost(url.hostname))) {
    throw new AppError(ERR.UNSAFE_URL, 'The URL host is not allowed', 400);
  }
  return url;
}

async function fetchWithTimeout(url: URL): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, redirect: 'manual', headers: { accept: '*/*' } });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error';
    throw badRequest(`Failed to fetch remote file: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

function tooLarge(maxBytes: number): AppError {
  return new AppError(ERR.VALIDATION_ERROR, `File exceeds the ${maxBytes} byte limit`, 413);
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function readAsset(
  response: Response,
  maxBytes: number,
  allowedMimes: readonly string[] | undefined,
): Promise<{ data: Buffer; mime: string }> {
  const declared = normalizeMime(response.headers.get('content-type'));
  if (allowedMimes && declared && !allowedMimes.includes(declared)) {
    throw badRequest(`Content-Type ${declared} is not in the allowed set`);
  }
  const declaredLength = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw tooLarge(maxBytes);
  if (!response.body) throw badRequest('Remote response has no body');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge(maxBytes);
    }
    chunks.push(value);
  }

  const data = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  const sniffed = sniffMime(data);
  if (!sniffed) throw badRequest('Remote file is not a recognized image or document (png/jpg/webp/svg/pdf)');
  if (allowedMimes && !allowedMimes.includes(sniffed)) {
    throw badRequest(`Remote file is ${sniffed}, which is not in the allowed set`);
  }
  return { data, mime: sniffed };
}

/* ------------------------------- service -------------------------------- */

export class MediaService {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly urls: MediaUrlBuilder,
  ) {}

  /** Writes a deterministic placeholder SVG through the active adapter. */
  async savePlaceholderImage(publicId: string, label: string, style: PlaceholderStyle = {}): Promise<void> {
    assertValidPublicId(publicId);
    const svg = renderPlaceholderSvg(label, style);
    await this.storage.write(publicId, Buffer.from(svg, 'utf8'), 'image/svg+xml');
  }

  /**
   * Downloads `url` server-side and stores it under `publicId`. SSRF checks
   * run before any request is made and are repeated for every redirect hop;
   * the body is size-capped while streaming and verified by magic bytes.
   */
  async uploadFromUrl(publicId: string, url: string, options: UploadFromUrlOptions = {}): Promise<void> {
    assertValidPublicId(publicId);
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
    const { data, mime } = await this.fetchRemoteAsset(url, maxBytes, options.allowedMimes);
    await this.storage.write(publicId, data, mime);
  }

  async deleteAsset(publicId: string): Promise<void> {
    assertValidPublicId(publicId);
    await this.storage.delete(publicId);
  }

  async exists(publicId: string): Promise<boolean> {
    if (!isValidPublicId(publicId)) return false;
    return this.storage.exists(publicId);
  }

  resolveUrl(publicId: string, kind?: MediaResourceKind): string {
    return this.urls.resolve(publicId, kind);
  }

  private async fetchRemoteAsset(
    url: string,
    maxBytes: number,
    allowedMimes: readonly string[] | undefined,
  ): Promise<{ data: Buffer; mime: string }> {
    let target = await assertFetchableUrl(url);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await fetchWithTimeout(target);
      if (isRedirect(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw badRequest('Remote server redirected without a location');
        // Resolve relative redirects, then re-run the full SSRF gate per hop.
        target = await assertFetchableUrl(new URL(location, target).toString());
        continue;
      }
      if (!response.ok) throw badRequest(`Remote server returned ${response.status}`);
      return await readAsset(response, maxBytes, allowedMimes);
    }
    throw badRequest(`Remote file redirected more than ${MAX_REDIRECTS} times`);
  }
}

/* ------------------------------ singletons ------------------------------ */

function createStorageAdapter(): StorageAdapter {
  const env = getEnv();
  if (env.STORAGE_ADAPTER === 'cloudinary') {
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      throw new Error(
        'STORAGE_ADAPTER=cloudinary requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET',
      );
    }
    return new CloudinaryStorageAdapter({
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      apiSecret: env.CLOUDINARY_API_SECRET,
    });
  }
  return new LocalStorageAdapter();
}

let cachedAdapter: StorageAdapter | undefined;
let adapterOverride: StorageAdapter | undefined;

/** The env-selected storage adapter (memoized; overridable for tests). */
export function getStorageAdapter(): StorageAdapter {
  if (adapterOverride) return adapterOverride;
  if (!cachedAdapter) cachedAdapter = createStorageAdapter();
  return cachedAdapter;
}

/** Test seam — swap the adapter (undefined restores the env-selected one). */
export function setStorageAdapter(adapter?: StorageAdapter): void {
  adapterOverride = adapter;
}

/** MediaService singleton bound to the env-selected adapter + URL builder. */
export const mediaService = new MediaService(getStorageAdapter(), mediaUrls);

/** Re-builds a MediaService against a fresh URL builder (test seam). */
export function createMediaService(): MediaService {
  return new MediaService(getStorageAdapter(), createMediaUrlBuilder());
}

/** Short random suffix for generated upload basenames. */
export function randomBasename(): string {
  return `asset-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
}
