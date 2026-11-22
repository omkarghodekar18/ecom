// Cloudinary signing primitives, built on node:crypto (the cloudinary npm
// package is intentionally NOT a dependency — ADR 0009/dev-simplicity).
// Signature algorithm (Cloudinary docs): take the upload/destroy params that
// require signing (everything except file, api_key, cloud_name and
// resource_type), sort them alphabetically, join as `k=v&k=v`, append the
// api_secret and SHA-1 the result.
import { createHash } from 'node:crypto';

/** SHA-1 signature over the sorted `k=v&…` params + api_secret. */
export function cloudinarySignature(params: Record<string, string>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(`${toSign}${apiSecret}`, 'utf8').digest('hex');
}

/** Signed-upload REST endpoint for a cloud/resource_type pair. */
export function cloudinaryUploadUrl(cloudName: string, resourceType: 'image' | 'raw'): string {
  return `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;
}

/** Signed-destroy REST endpoint (public_id includes its folder). */
export function cloudinaryDestroyUrl(cloudName: string, resourceType: 'image' | 'raw'): string {
  return `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`;
}
