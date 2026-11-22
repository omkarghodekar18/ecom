// GTIN checksum validation (spec Section 16: imports must reject bad EAN/GTIN).
import { describe, expect, it } from 'vitest';
import { isValidGtin } from '../../src/common/utils/gtin.util.js';

describe('isValidGtin', () => {
  it.each([
    ['4006381333931', 'GTIN-13 (EAN-13) with valid checksum'],
    ['04006381333931', 'GTIN-14: same code left-padded to 14'],
    ['12345670', 'GTIN-8 with valid checksum'],
    ['036000291452', 'GTIN-12 (UPC-A) with valid checksum'],
  ])('accepts %s (%s)', (value) => {
    expect(isValidGtin(value)).toBe(true);
  });

  it('rejects a wrong check digit', () => {
    expect(isValidGtin('4006381333932')).toBe(false); // valid GTIN-13, checksum bumped
    expect(isValidGtin('12345671')).toBe(false);
  });

  it('rejects non-numeric values', () => {
    expect(isValidGtin('40063813339X1')).toBe(false);
    expect(isValidGtin('ABCDEFGHIJ1234')).toBe(false);
    expect(isValidGtin('')).toBe(false);
  });

  it('rejects unsupported lengths', () => {
    expect(isValidGtin('12345')).toBe(false); // 5 digits
    expect(isValidGtin('123456')).toBe(false); // 6 digits
    expect(isValidGtin('12345678901')).toBe(false); // 11 digits
  });
});
