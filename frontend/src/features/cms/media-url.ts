// Single publicId → URL resolver (spec 14: "never store full URLs in the DB").
// The local storage adapter serves assets at GET /media/<publicId>; Cloudinary
// URLs and already-resolved /media/ paths pass through untouched.

/** True when the value is already a deliverable URL, not a bare publicId. */
function isResolvedUrl(value: string): boolean {
  return value.startsWith('/media/') || /^[a-z]+:\/\//i.test(value) || value.startsWith('//');
}

/**
 * Resolves a media publicId (e.g. `cms/banners/hero-1.svg`) to a deliverable
 * URL (`/media/cms/banners/hero-1.svg`). Absolute URLs and /media/ paths are
 * returned as-is. The ONLY place in the storefront that knows this rule.
 */
export function mediaUrl(publicId: string): string {
  const trimmed = publicId.trim();
  if (trimmed === '') return '';
  if (isResolvedUrl(trimmed)) return trimmed;
  return `/media/${trimmed.replace(/^\/+/, '')}`;
}
