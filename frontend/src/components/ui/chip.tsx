'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Removable filter chip as used in the "Active filters" row on listing pages.
 * Renders the label plus an X button wired to `onRemove`; pass `selected` to
 * give it the orange selected border.
 *
 * @example <Chip label="Brand: Garant" onRemove={() => remove('brand')} />
 */
export interface ChipProps {
  /** Chip label (plain text recommended for the default remove label). */
  label: ReactNode;
  /** Called when the X button is activated. Omit to render a static chip. */
  onRemove?: () => void;
  /** Selected state — orange border instead of grey. */
  selected?: boolean;
  /** Accessible name for the remove button; defaults to "Remove filter {label}". */
  removeLabel?: string;
  className?: string;
}

export function Chip({ label, onRemove, selected, removeLabel, className }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-pill border px-3 py-1 text-sm leading-5',
        selected ? 'border-brand bg-brand/5 text-brand' : 'border-line bg-white text-ink',
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={
            removeLabel ??
            (typeof label === 'string' ? `Remove filter ${label}` : 'Remove filter')
          }
          className={cn(
            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none',
            selected ? 'text-brand hover:bg-brand/10' : 'text-muted hover:bg-tile hover:text-ink',
          )}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
