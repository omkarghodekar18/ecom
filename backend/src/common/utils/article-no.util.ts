// Article-number lookup candidates. Stored article numbers use the Hoffmann
// style "111100 0,5" (space + comma decimal); users type "111100 0.5",
// "111100 0,5" or "1111000,5". The resolver tries, in order: the raw trimmed
// string, whitespace-collapsed, and the comma/dot-normalised form — callers
// look up all candidates and take the first hit.
const COLLAPSE = /\s+/g;

/** Distinct lookup candidates for a user-entered article number. */
export function articleNoCandidates(raw: string): string[] {
  const out: string[] = [];
  function push(value: string): void {
    const v = value.trim();
    if (v !== '' && !out.includes(v)) out.push(v);
  }
  push(raw);
  const collapsed = raw.trim().replace(COLLAPSE, ' ');
  push(collapsed);
  // Decimal-comma ↔ decimal-dot in the last token ("111100 0,5" ↔ "111100 0.5").
  push(collapsed.replace(/(\d),(\d)/g, '$1.$2'));
  push(collapsed.replace(/(\d)\.(\d)/g, '$1,$2'));
  return out;
}
