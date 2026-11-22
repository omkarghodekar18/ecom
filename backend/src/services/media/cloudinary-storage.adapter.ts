// Cloudinary adapter (prod, ADR 0012): signed REST uploads/destroys built
// with node:crypto + the global fetch — no cloudinary package dependency.
// Delivery happens straight from the CDN (`res.cloudinary.com`), so read()
// is intentionally unsupported server-side; the API never needs the bytes.
import { posix } from 'node:path';
import { AppError } from '../../common/errors/app-error.js';
import { ERR } from '../../config/constants.js';
import { logger } from '../../config/logger.js';
import {
  cloudinaryDestroyUrl,
  cloudinarySignature,
  cloudinaryUploadUrl,
} from './cloudinary-signature.util.js';
import type { MediaResourceKind, StorageAdapter, StoredObject } from './media.types.js';
import { assertValidPublicId } from './public-id.util.js';

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

interface CloudinaryOkResponse {
  public_id?: string;
  result?: string;
}

interface CloudinaryErrorResponse {
  error?: { message?: string };
}

type CloudinaryResponse = CloudinaryOkResponse & CloudinaryErrorResponse;

function resourceKindFor(mime: string): MediaResourceKind {
  return mime.startsWith('image/') ? 'image' : 'raw';
}

export class CloudinaryStorageAdapter implements StorageAdapter {
  constructor(private readonly credentials: CloudinaryCredentials) {}

  async write(publicId: string, data: Buffer, mime: string): Promise<void> {
    assertValidPublicId(publicId);
    const kind = resourceKindFor(mime);
    const folder = posix.dirname(publicId);
    const basename = posix.basename(publicId);

    const params: Record<string, string> = {
      public_id: basename,
      timestamp: String(Math.floor(Date.now() / 1000)),
    };
    if (folder && folder !== '.') params.folder = folder;

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(data)], { type: mime }), basename);
    for (const [key, value] of Object.entries(params)) form.append(key, value);
    form.append('api_key', this.credentials.apiKey);
    form.append('signature', cloudinarySignature(params, this.credentials.apiSecret));

    const response = await fetch(cloudinaryUploadUrl(this.credentials.cloudName, kind), {
      method: 'POST',
      body: form,
    });
    const body = (await response.json().catch(() => null)) as CloudinaryResponse | null;
    if (!response.ok || !body || body.error) {
      throw new AppError(ERR.STORAGE_ERROR, 'Cloudinary upload failed', 502, {
        status: response.status,
        reason: body?.error?.message ?? 'no error payload',
      });
    }
  }

  async read(_publicId: string): Promise<StoredObject | null> {
    // Assets are delivered by the CDN; the API must never need the bytes.
    throw new AppError(ERR.STORAGE_ERROR, 'Cloudinary read is not supported server-side', 500);
  }

  async delete(publicId: string): Promise<void> {
    assertValidPublicId(publicId);
    // The adapter is not told the resource type at delete time, so probe
    // image first, then raw; a 'not found' on both is a no-op.
    if ((await this.destroy(publicId, 'image')) === 'ok') return;
    await this.destroy(publicId, 'raw');
  }

  async exists(publicId: string): Promise<boolean> {
    assertValidPublicId(publicId);
    logger.debug({ publicId }, 'cloudinary exists() is best-effort: assuming present');
    return true;
  }

  private async destroy(publicId: string, kind: MediaResourceKind): Promise<'ok' | 'not found'> {
    const params: Record<string, string> = {
      public_id: publicId,
      timestamp: String(Math.floor(Date.now() / 1000)),
    };
    const form = new FormData();
    form.append('public_id', publicId);
    form.append('timestamp', params.timestamp ?? '');
    form.append('api_key', this.credentials.apiKey);
    form.append('signature', cloudinarySignature(params, this.credentials.apiSecret));

    const response = await fetch(cloudinaryDestroyUrl(this.credentials.cloudName, kind), {
      method: 'POST',
      body: form,
    });
    const body = (await response.json().catch(() => null)) as CloudinaryResponse | null;
    if (!response.ok || !body || body.error) {
      throw new AppError(ERR.STORAGE_ERROR, `Cloudinary destroy failed (${kind})`, 502, {
        status: response.status,
        reason: body?.error?.message ?? 'no error payload',
      });
    }
    return body.result === 'ok' ? 'ok' : 'not found';
  }
}
