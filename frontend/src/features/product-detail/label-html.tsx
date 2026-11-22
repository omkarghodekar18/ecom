// Safe inline-markup renderer for attribute labels (spec 6.4): labels may
// carry subscript/superscript markup like "Nominal ⌀ D<sub>C</sub> k12".
// The raw string is NEVER injected as HTML — it is parsed by hand and only
// <sub>/<sup> are recognised; everything else renders as literal text.
import { Fragment, type ReactNode } from 'react';

type Token = { kind: 'text' | 'sub' | 'sup'; text: string };

/**
 * Parses a label string into text/sub/sup tokens. Tags are matched with a
 * strict, case-insensitive regex; unbalanced or unknown tags are treated as
 * literal text (defensive against malformed seeds/admin input).
 */
export function parseInlineMarkup(label: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /<(sub|sup)>(.*?)<\/\1>/gi;
  let cursor = 0;
  for (const match of label.matchAll(pattern)) {
    const index = match.index ?? 0;
    const tag = match[1]?.toLowerCase();
    const text = match[2] ?? '';
    if (index > cursor) tokens.push({ kind: 'text', text: label.slice(cursor, index) });
    if (tag === 'sub' || tag === 'sup') {
      tokens.push({ kind: tag, text });
    } else if (text) {
      tokens.push({ kind: 'text', text });
    }
    cursor = index + match[0].length;
  }
  if (cursor < label.length) tokens.push({ kind: 'text', text: label.slice(cursor) });
  return tokens;
}

/** Renders parsed tokens as React nodes (`<sub>`/`<sup>` are real elements). */
export function renderInlineTokens(tokens: Token[]): ReactNode {
  return tokens.map((token, i) => {
    if (token.kind === 'sub') return <sub key={i}>{token.text}</sub>;
    if (token.kind === 'sup') return <sup key={i}>{token.text}</sup>;
    return <Fragment key={i}>{token.text}</Fragment>;
  });
}

/**
 * Label with safe inline markup. Falls back to plain text when `html` is
 * null/empty. Optionally appends a unit (e.g. " (mm)").
 *
 * @example <LabelHtml html="Nominal ⌀ D<sub>C</sub> k12" fallback="Nominal ⌀ D k12" unit="mm" />
 */
export function LabelHtml({
  html,
  fallback,
  unit,
}: {
  html?: string | null;
  fallback?: string | null;
  /** Appended as " (unit)" when present. */
  unit?: string | null;
}) {
  const source = html && html.trim() !== '' ? html : (fallback ?? '');
  return (
    <>
      {renderInlineTokens(parseInlineMarkup(source))}
      {unit ? ` (${unit})` : null}
    </>
  );
}
