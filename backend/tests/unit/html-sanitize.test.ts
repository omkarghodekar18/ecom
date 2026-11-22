// HTML sanitisation allow-list (spec Section 18) used by descriptions/CMS
// and, later, by the bulk import pipeline.
import { describe, expect, it } from 'vitest';
import {
  sanitizeDescriptionHtml,
  sanitizePlainOrHtml,
  stripTags,
} from '../../src/common/utils/html-sanitize.util.js';

describe('sanitizeDescriptionHtml', () => {
  it('strips <script> including its content', () => {
    const out = sanitizeDescriptionHtml('<p>Drill bit</p><script>alert(1)</script>');
    expect(out).toContain('Drill bit');
    expect(out).not.toContain('script');
    expect(out).not.toContain('alert');
  });

  it('strips event handler attributes', () => {
    const out = sanitizeDescriptionHtml('<p onclick="evil()" onmouseover="evil()">HSS-E</p>');
    expect(out).toContain('HSS-E');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onmouseover');
    expect(out).not.toContain('evil');
  });

  it('keeps allowed structural tags', () => {
    const html = '<h2>Spec</h2><table><thead><tr><th>d</th></tr></thead><tbody><tr><td>3.15 mm</td></tr></tbody></table><ul><li>DIN 333</li></ul>';
    const out = sanitizeDescriptionHtml(html);
    expect(out).toContain('<h2>Spec</h2>');
    expect(out).toContain('<thead>');
    expect(out).toContain('<th>d</th>');
    expect(out).toContain('<td>3.15 mm</td>');
    expect(out).toContain('<li>DIN 333</li>');
  });

  it('keeps sub and sup (technical notations like mm²)', () => {
    const out = sanitizeDescriptionHtml('<p>6 mm<sup>2</sup> and H<sub>2</sub>O</p>');
    expect(out).toContain('<sup>2</sup>');
    expect(out).toContain('<sub>2</sub>');
  });

  it('keeps http(s) hrefs and hardens links', () => {
    const out = sanitizeDescriptionHtml('<a href="https://example.com/x">docs</a>');
    expect(out).toContain('href="https://example.com/x"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('drops javascript: hrefs and unallowed attributes like style', () => {
    const out = sanitizeDescriptionHtml('<a href="javascript:alert(1)" style="color:red">x</a><p style="color:red">y</p>');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('style');
    expect(out).toContain('>x</a>');
    expect(out).toContain('>y</p>');
  });

  it('allows only https image sources', () => {
    const out = sanitizeDescriptionHtml('<img src="https://cdn.example.com/a.png" alt="drill"><img src="http://cdn.example.com/a.png">');
    expect(out).toContain('src="https://cdn.example.com/a.png"');
    expect(out).toContain('alt="drill"');
    expect(out).not.toContain('http://cdn.example.com/a.png');
  });

  it('drops disallowed tags but keeps their text', () => {
    const out = sanitizeDescriptionHtml('<div>keeps text</div><h1>heading text</h1>');
    expect(out).not.toContain('<div>');
    expect(out).not.toContain('<h1>');
    expect(out).toContain('keeps text');
    expect(out).toContain('heading text');
  });
});

describe('stripTags', () => {
  it('removes all markup and decodes entities', () => {
    expect(stripTags('<p>HSS-E &amp; TiAlN<br/><strong>coating</strong></p>')).toBe(
      'HSS-E & TiAlNcoating',
    );
  });

  it('returns plain text untouched', () => {
    expect(stripTags('Centre drill DIN 333')).toBe('Centre drill DIN 333');
  });
});

describe('sanitizePlainOrHtml', () => {
  it('reports when sanitisation changed the value', () => {
    const dirty = sanitizePlainOrHtml('<p>ok</p><script>bad()</script>');
    expect(dirty.changed).toBe(true);
    expect(dirty.clean).toContain('ok');
    expect(dirty.clean).not.toContain('bad');
  });

  it('reports unchanged for already-clean values', () => {
    const clean = sanitizePlainOrHtml('Centre drill for lathes');
    expect(clean.changed).toBe(false);
    expect(clean.clean).toBe('Centre drill for lathes');
  });
});
