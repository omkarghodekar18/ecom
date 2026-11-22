// GTIN validation (spec Section 16: import rows must carry a checksum-valid
// EAN/GTIN). Pure function, no dependencies — safe to mirror into shared/.

/** GTIN families and their total lengths (data digits + 1 check digit). */
const GTIN_LENGTHS = [8, 12, 13, 14] as const;

/**
 * Validates a GTIN-8/12/13/14 (EAN/UPC-family) code with the GS1 check digit.
 *
 * Algorithm (GS1 mod-10): reading the digits right to left and ignoring the
 * rightmost check digit, multiply the first data digit by 3, the next by 1,
 * the next by 3 and so on; sum everything; the check digit is the value that
 * rounds the total up to the next multiple of ten, i.e.
 * `(10 - (sum mod 10)) mod 10`. Lengths 8/12/13/14 all share this rule —
 * shorter codes behave like a GTIN-14 left-padded with zeros.
 *
 * @param value Candidate code (expected: digits only, exact length).
 * @returns `true` when the value is a numeric GTIN of a known length whose
 * check digit matches the recomputed one.
 */
export function isValidGtin(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  if (!(GTIN_LENGTHS as readonly number[]).includes(value.length)) return false;

  const digits = [...value].map((d) => Number(d));
  const checkDigit = digits[digits.length - 1];
  if (checkDigit === undefined) return false;

  let sum = 0;
  // Rightmost data digit (index length-2) is weighted 3, alternating leftwards.
  for (let i = 0; i < digits.length - 1; i += 1) {
    const digit = digits[i] ?? 0;
    const weight = (digits.length - 2 - i) % 2 === 0 ? 3 : 1;
    sum += digit * weight;
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === checkDigit;
}
