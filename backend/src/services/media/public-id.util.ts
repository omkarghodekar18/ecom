// publicId validation (ADR 0012): path-shaped keys like
// `catalog/products/{id}/photo-1`. The charset is deliberately tiny
// (lowercase URL-safe, no spaces/unicode/backslashes) and '..' path segments
// are rejected outright so keys can never traverse out of the uploads root.
import { badRequest } from '../../common/errors/app-error.js';

/** Max key length — folders are shallow but leave generous headroom. */
const MAX_PUBLIC_ID_LENGTH = 512;

export const PUBLIC_ID_PATTERN = /^[a-z0-9/._-]+$/;

/** True when `publicId` is a safe storage key (charset + no '..' segments). */
export function isValidPublicId(publicId: string): boolean {
  if (publicId.length === 0 || publicId.length > MAX_PUBLIC_ID_LENGTH) return false;
  if (!PUBLIC_ID_PATTERN.test(publicId)) return false;
  if (publicId.split('/').includes('..')) return false;
  return true;
}

/** `isValidPublicId` as a 400 VALIDATION_ERROR — the gate for every write. */
export function assertValidPublicId(publicId: string): void {
  if (!isValidPublicId(publicId)) {
    throw badRequest(`Invalid publicId ${JSON.stringify(publicId)}`);
  }
}
