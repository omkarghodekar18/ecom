// Seed utilities — deterministic helpers shared by all seed steps. Everything
// here is pure and stable across runs/platforms (FNV-1a hashing) so re-running
// the seed produces byte-identical article numbers, EANs, prices and stock mix.

/** FNV-1a 32-bit hash — deterministic string → uint32. */
export function hash32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Force to unsigned 32-bit.
  return hash >>> 0;
}

/** Round to 2 decimal places (money). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Builds a checksum-valid GTIN-13 from a 12-digit base (GS1 mod-10 check
 * digit: data digits weighted 1/3 from the left, check digit rounds the sum
 * up to the next multiple of ten). Mirrors src/common/utils/gtin.util.ts so
 * every EAN seeded here passes the import validator later (spec Section 16).
 */
export function makeGtin13(base12: string): string {
  if (!/^\d{12}$/.test(base12)) {
    throw new Error(`makeGtin13 expects exactly 12 digits, got ${JSON.stringify(base12)}`);
  }
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const digit = Number(base12[i]);
    // Leftmost digit carries weight 1 in GTIN-13, alternating 1,3,1,3…
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return `${base12}${check}`;
}

/**
 * Deterministic small integer in [0, span) derived from a seed string — used
 * for stock quantities, lead-time picks and image counts.
 */
export function pick(seed: string, span: number): number {
  if (span <= 0) return 0;
  return hash32(seed) % span;
}

/**
 * Deterministic price wobble in [-4%, +4%] so list prices look hand-set
 * instead of formula-exact, while staying stable across seed runs.
 */
export function wobble(seed: string): number {
  const offset = (hash32(`wobble:${seed}`) % 81) - 40; // -40..40
  return 1 + offset / 1000;
}

/**
 * Formats a diameter like a continental article-number token: comma decimal
 * separator, no trailing zeros ("3.15" → "3,15", "2" → "2", "0.5" → "0,5").
 */
export function commaNumber(value: number): string {
  const fixed = (Math.round(value * 100) / 100).toFixed(2);
  const trimmed = fixed.replace(/00$/, '').replace(/(\.\d)0$/, '$1').replace(/\.$/, '');
  return trimmed.includes('.') ? trimmed.replace('.', ',') : trimmed;
}

/** Formats a millimetre size as a compact decimal token ("3.15", "2", "0.5"). */
export function mm(value: number): string {
  return String(Math.round(value * 100) / 100);
}
