import { describe, expect, it } from 'vitest';
import { safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
  it('returns the site root for undefined input', () => {
    expect(safeRedirect(undefined)).toBe('/');
  });

  it('returns the site root for empty input', () => {
    expect(safeRedirect('')).toBe('/');
    expect(safeRedirect('   ')).toBe('/');
  });

  it('keeps safe internal paths', () => {
    expect(safeRedirect('/in/en/cart')).toBe('/in/en/cart');
    expect(safeRedirect('/in/en/my-account/profile')).toBe('/in/en/my-account/profile');
  });

  it('keeps query strings and allows colons after the first ?', () => {
    expect(safeRedirect('/in/en/search?q=https://x&page=2')).toBe('/in/en/search?q=https://x&page=2');
  });

  it('rejects absolute https URLs', () => {
    expect(safeRedirect('https://evil.com')).toBe('/in/en');
    expect(safeRedirect('http://evil.com/path')).toBe('/in/en');
  });

  it('rejects protocol-relative URLs', () => {
    expect(safeRedirect('//evil.com')).toBe('/in/en');
    expect(safeRedirect('///evil.com')).toBe('/in/en');
  });

  it('rejects backslash tricks browsers may normalise to //', () => {
    expect(safeRedirect('/\\evil.com')).toBe('/in/en');
    expect(safeRedirect('/\\/evil.com')).toBe('/in/en');
  });

  it('rejects javascript: URIs', () => {
    expect(safeRedirect('javascript:alert(1)')).toBe('/in/en');
  });

  it('rejects scheme separators smuggled into the path', () => {
    expect(safeRedirect('/in/en:evil')).toBe('/in/en');
    expect(safeRedirect('/https://evil.com')).toBe('/in/en');
  });

  it('rejects relative and whitespace-padded paths', () => {
    expect(safeRedirect('cart')).toBe('/in/en');
    expect(safeRedirect(' /in/en/cart ')).toBe('/in/en/cart'); // trimmed → safe
  });
});
