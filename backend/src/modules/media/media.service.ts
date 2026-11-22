// Media module service: the HTTP-facing half of ADR 0012 — validates and
// signs admin uploads (local ticket vs Cloudinary signed REST params),
// ingests raw binary uploads with magic-byte verification, and prepares
// delivery metadata for GET /media (local adapter only; Cloudinary assets
// are delivered straight from the CDN).
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { AppError, badRequest, notFound } from '../../common/errors/app-error.js';
import { ERR } from '../../config/constants.js';
import { getEnv } from '../../config/env.js';
import type { SignUploadInput, SignUploadResponse, UploadedAssetDto } from '../../shared/dto/media.dto.js';
import {
  cloudinarySignature,
  cloudinaryUploadUrl,
  DEFAULT_MAX_UPLOAD_BYTES,
  extensionFromMime,
  getStorageAdapter,
  isValidPublicId,
  LocalStorageAdapter,
  mediaUrls,
  mimeFromExtension,
  normalizeMime,
  randomBasename,
  sniffMime,
} from '../../services/media/index.js';

/** Folder allow-list for admin uploads (subpaths allowed under each prefix). */
export const ALLOWED_UPLOAD_FOLDERS = [
  'catalog/products/',
  'catalog/categories/',
  'catalog/documents/',
  'cms/banners/',
  'brands/',
  'imports/',
] as const;

/** Allowed image payloads (svg counts as an image on both adapters). */
export const IMAGE_UPLOAD_MIMES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'] as const;
/** Allowed raw/document payloads. */
export const RAW_UPLOAD_MIMES = ['application/pdf'] as const;

const ALL_UPLOAD_MIMES: readonly string[] = [...IMAGE_UPLOAD_MIMES, ...RAW_UPLOAD_MIMES];

export interface ServedAsset {
  data: Buffer;
  mime: string;
  etag: string;
}

/** Upload-folder form used in publicIds: always trailing-slash terminated. */
export function normalizeUploadFolder(folder: string): string {
  return folder.endsWith('/') ? folder : `${folder}/`;
}

/** True when `folder` is valid AND sits under an allowed prefix. */
export function isAllowedUploadFolder(folder: string): boolean {
  if (!isValidPublicId(folder)) return false;
  return ALLOWED_UPLOAD_FOLDERS.some((prefix) => folder.startsWith(prefix));
}

/** Lowercase URL-safe single segment; path pieces and dots collapse away. */
export function sanitizeFilename(name: string): string {
  const base = (name.split('/').pop() ?? '').toLowerCase();
  return base
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/\.+/g, '.')
    .replace(/^[.\\-]+/, '')
    .replace(/[.\\-]+$/, '');
}

function stripExtension(basename: string): string {
  return basename.replace(/\.[a-z0-9]+$/, '');
}

/**
 * Derives the storage key from a validated sign-upload request:
 * `folder + sanitized filename`, appending the canonical extension for the
 * declared mime when the filename carries none.
 */
export function buildUploadPublicId(input: SignUploadInput): string {
  const folder = normalizeUploadFolder(input.folder);
  if (!isAllowedUploadFolder(folder)) {
    throw badRequest(`folder must sit under one of: ${ALLOWED_UPLOAD_FOLDERS.join(' ')}`);
  }

  const mime = input.mime ? normalizeMime(input.mime) : '';
  const allowed: readonly string[] =
    input.resourceType === 'image' ? IMAGE_UPLOAD_MIMES : RAW_UPLOAD_MIMES;
  if (mime && !allowed.includes(mime)) {
    throw badRequest(`mime must be one of ${allowed.join(', ')} for resourceType ${input.resourceType}`);
  }

  let basename = input.filename ? sanitizeFilename(input.filename) : '';
  if (!basename) basename = randomBasename();
  if (!/\.[a-z0-9]+$/.test(basename) && mime) basename += extensionFromMime(mime) ?? '';

  const publicId = `${folder}${basename}`;
  if (!isValidPublicId(publicId)) throw badRequest('Could not derive a valid publicId from the request');
  return publicId;
}

export interface StoreUploadInput {
  publicId: string;
  bytes: Buffer;
  /** Effective type: x-mime header, falling back to the request Content-Type. */
  declaredMime: string | undefined;
}

export class MediaModuleService {
  /**
   * Issues an upload ticket for the active adapter. Local: the client POSTs
   * the raw bytes to our own endpoint with the pre-validated publicId.
   * Cloudinary: the client uploads straight to the signed REST endpoint
   * (public_id carries no extension — format is derived at delivery, ADR 0012).
   */
  signUpload(input: SignUploadInput): SignUploadResponse {
    const publicId = buildUploadPublicId(input);
    const adapter = getStorageAdapter();

    if (adapter instanceof LocalStorageAdapter) {
      return {
        adapter: 'local',
        uploadUrl: '/api/v1/admin/media/upload',
        fields: { publicId },
      };
    }

    const env = getEnv();
    const folder = normalizeUploadFolder(input.folder).replace(/\/+$/, '');
    const cloudPublicId = stripExtension(posix.basename(publicId));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const params: Record<string, string> = { folder, public_id: cloudPublicId, timestamp };
    return {
      adapter: 'cloudinary',
      uploadUrl: cloudinaryUploadUrl(env.CLOUDINARY_CLOUD_NAME, input.resourceType),
      fields: {
        api_key: env.CLOUDINARY_API_KEY,
        folder,
        public_id: cloudPublicId,
        timestamp,
        signature: cloudinarySignature(params, env.CLOUDINARY_API_SECRET),
      },
    };
  }

  /**
   * Verifies and persists a binary admin upload: allowed folder, allowed
   * and declared MIME, magic bytes matching the declaration and (when the
   * publicId carries one) a matching extension.
   */
  async storeUpload(input: StoreUploadInput): Promise<UploadedAssetDto> {
    const { publicId, bytes } = input;
    if (!isValidPublicId(publicId)) throw badRequest(`Invalid publicId ${JSON.stringify(publicId)}`);

    const folderEnd = publicId.lastIndexOf('/');
    const folder = folderEnd === -1 ? '' : publicId.slice(0, folderEnd + 1);
    if (!isAllowedUploadFolder(folder)) {
      throw badRequest(`publicId must sit under one of: ${ALLOWED_UPLOAD_FOLDERS.join(' ')}`);
    }
    if (bytes.length === 0) throw badRequest('Upload body is empty');
    if (bytes.length > DEFAULT_MAX_UPLOAD_BYTES) {
      throw new AppError(ERR.VALIDATION_ERROR, `Upload exceeds the ${DEFAULT_MAX_UPLOAD_BYTES} byte limit`, 413);
    }

    const declared = input.declaredMime ? normalizeMime(input.declaredMime) : '';
    if (!declared) throw badRequest('Declare the asset type via Content-Type or the x-mime header');
    if (!ALL_UPLOAD_MIMES.includes(declared)) {
      throw badRequest(`Unsupported media type ${declared}; allowed: ${ALL_UPLOAD_MIMES.join(', ')}`);
    }

    const sniffed = sniffMime(bytes);
    if (!sniffed || sniffed !== declared) {
      throw badRequest('File content does not match the declared media type');
    }

    const byExtension = mimeFromExtension(posix.extname(publicId));
    if (byExtension !== 'application/octet-stream' && byExtension !== sniffed) {
      throw badRequest('The publicId extension does not match the file content');
    }

    await getStorageAdapter().write(publicId, bytes, sniffed);
    return {
      publicId,
      url: mediaUrls.resolve(publicId, sniffed === 'application/pdf' ? 'raw' : 'image'),
    };
  }

  /**
   * Delivery metadata for GET /media/<publicId> — local adapter only
   * (Cloudinary publicIds never route through this endpoint). Immutable
   * publicIds get a strong, mtime-based ETag and a one-year immutable cache.
   */
  async serveAsset(publicId: string): Promise<ServedAsset> {
    if (!isValidPublicId(publicId)) throw notFound('Media asset not found');

    const adapter = getStorageAdapter();
    if (!(adapter instanceof LocalStorageAdapter)) throw notFound('Media asset not found');

    const object = await adapter.read(publicId);
    if (!object) throw notFound('Media asset not found');

    const info = await adapter.stat(publicId);
    const etag = `"${createHash('sha1').update(`${publicId}:${info?.mtimeMs ?? 0}`).digest('hex')}"`;
    return { data: object.data, mime: object.mime, etag };
  }
}

export const mediaModuleService = new MediaModuleService();
