// Delivery URL resolution (ADR 0012): DTOs carry `url` fields resolved at
// mapping time — `/media/<publicId>` for the local adapter (the Next rewrite
// proxies /media/*), the Cloudinary CDN URL in prod. A single builder is
// chosen by STORAGE_ADAPTER so modules never branch on the provider.
import { getEnv } from '../../config/env.js';
import type { MediaResourceKind, MediaUrlBuilder } from './media.types.js';

export class LocalMediaUrlBuilder implements MediaUrlBuilder {
  resolve(publicId: string, _kind?: MediaResourceKind): string {
    return `/media/${publicId}`;
  }
}

export class CloudinaryMediaUrlBuilder implements MediaUrlBuilder {
  constructor(
    private readonly cloudName: string,
    private readonly secureDistribution = '',
  ) {}

  resolve(publicId: string, kind: MediaResourceKind = 'image'): string {
    const host = this.secureDistribution || `res.cloudinary.com/${this.cloudName}`;
    return `https://${host}/${kind}/upload/${publicId}`;
  }
}

export function createMediaUrlBuilder(): MediaUrlBuilder {
  const env = getEnv();
  if (env.STORAGE_ADAPTER === 'cloudinary') {
    if (!env.CLOUDINARY_CLOUD_NAME) {
      throw new Error('STORAGE_ADAPTER=cloudinary requires CLOUDINARY_CLOUD_NAME');
    }
    return new CloudinaryMediaUrlBuilder(env.CLOUDINARY_CLOUD_NAME, env.CLOUDINARY_SECURE_DISTRIBUTION);
  }
  return new LocalMediaUrlBuilder();
}

/** Singleton used by DTO mappers — publicIds are URL-safe by construction. */
export const mediaUrls: MediaUrlBuilder = createMediaUrlBuilder();
