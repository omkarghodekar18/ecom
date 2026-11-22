// MIME helpers for the media service: the local adapter derives delivery
// Content-Type from the publicId extension (ADR 0012), sign-upload derives
// an extension from the declared MIME, and uploads normalize whatever the
// client sent (params like `; charset=` stripped, common aliases folded).
const MIME_BY_EXTENSION: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/svg+xml': '.svg',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

export const DEFAULT_MIME = 'application/octet-stream';

/** Content-Type for a publicId extension; octet-stream when unknown/missing. */
export function mimeFromExtension(extension: string): string {
  const normalized = extension.toLowerCase();
  return MIME_BY_EXTENSION[normalized] ?? DEFAULT_MIME;
}

/** Canonical extension for a supported MIME type, undefined otherwise. */
export function extensionFromMime(mime: string): string | undefined {
  return EXTENSION_BY_MIME[mime];
}

/**
 * Normalizes a client/remote-supplied media type: lowercase, parameters
 * stripped, common aliases (`image/jpg`) folded. Empty string when absent.
 */
export function normalizeMime(value: string | null | undefined): string {
  if (!value) return '';
  const base = value.toLowerCase().split(';')[0]?.trim() ?? '';
  if (base === 'image/jpg') return 'image/jpeg';
  return base;
}
