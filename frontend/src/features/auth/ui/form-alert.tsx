'use client';

// Small shared messages for the auth forms (inline errors + success notices).
import { CircleAlert, Info } from 'lucide-react';
import type { ReactNode } from 'react';

/** Inline form error, announced to screen readers via role="alert". */
export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-btn border border-stock-red bg-stock-red/10 p-3 text-sm font-medium text-ink"
    >
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-stock-red" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** Neutral inline notice (e.g. "Code sent", checkout redirect hint). */
export function FormNotice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-btn border border-line bg-tile p-3 text-sm text-ink">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
