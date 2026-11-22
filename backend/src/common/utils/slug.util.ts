// Slug helper: turns a human name into a URL-safe slug ("Power Drills 9000"
// → "power-drills-9000"). Shared by the catalog and brands modules; the
// caller is responsible for uniqueness (suffix loops live in the repositories).

/** Lowercases, strips diacritics, collapses non-alphanumerics to single hyphens. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}
