// HTML sanitisation (spec Section 18): sanitize-html with a strict allow-list
// for product descriptions and CMS blocks, plus helpers for text extraction
// and import-side normalisation.
import sanitizeHtml from 'sanitize-html';

/**
 * Tags we render in long descriptions/CMS content. Anything else — script,
 * style, iframe, form, event handlers — is removed by the allow-list itself.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'h2',
  'h3',
  'h4',
  'a',
  'img',
  'sub',
  'sup',
  'span',
] as const;

/** Only href on links and src/alt on images survive; class/style never do.
 * rel/target are allowed ONLY because the transform below force-overwrites
 * them with safe values — input values never survive. */
const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'rel', 'target'],
  img: ['src', 'alt'],
};

const SANITIZE_OPTIONS = {
  allowedTags: [...ALLOWED_TAGS],
  allowedAttributes: ALLOWED_ATTRIBUTES,
  // http(s) hrefs only; images must come over https (CDN).
  allowedSchemes: ['http', 'https'],
  allowedSchemesByTag: { img: ['https'] },
  allowProtocolRelative: false,
  // Links open safely in a new tab.
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

/**
 * Sanitises rich HTML to the description/CMS allow-list. Scripts, styles,
 * event handler attributes and non-allow-listed tags are removed; inner text
 * of removed tags is preserved.
 */
export function sanitizeDescriptionHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

/**
 * Strips every tag, returning readable text (for meta descriptions, search
 * indexing and text-only contexts). The five entities sanitize-html escapes
 * on output are decoded back to characters.
 */
const ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&amp;': '&',
};

export function stripTags(html: string): string {
  const stripped = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
  return stripped.replace(/&(?:lt|gt|quot|#39|amp);/g, (entity) => ENTITIES[entity] ?? entity).trim();
}

/**
 * Sanitises a value that may arrive as plain text or as HTML (bulk import
 * description columns do both — spec Section 16).
 *
 * @returns `clean` — the sanitised value; `changed` — whether sanitisation
 * actually altered the input (imports report this as a WARNING row).
 */
export function sanitizePlainOrHtml(value: string): { clean: string; changed: boolean } {
  const clean = sanitizeDescriptionHtml(value);
  return { clean, changed: clean !== value };
}
