'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Builds the visible page list: always the first and last page, the current
 * page and its neighbours, with `'ellipsis'` markers for larger gaps.
 */
function buildPages(page: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const wanted = new Set<number>();
  for (const n of [1, page - 1, page, page + 1, totalPages]) {
    if (n >= 1 && n <= totalPages) wanted.add(n);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: Array<number | 'ellipsis'> = [];
  sorted.forEach((n, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && n - prev > 1) out.push('ellipsis');
    out.push(n);
  });
  return out;
}

const pageButtonClasses =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-btn border border-line px-2 text-sm font-medium transition-colors hover:border-brand hover:text-brand focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40';

/**
 * Numbered pagination with Previous/Next chevron buttons, ellipsis logic
 * (first/last always visible, current ±1 kept) and a screen-reader-only
 * "Page X of Y" announcement. Fully controlled via `{page, totalPages, onChange}`.
 *
 * @example <Pagination page={page} totalPages={9} onChange={setPage} />
 */
export interface PaginationProps {
  /** Current page (1-based). */
  page: number;
  /** Total number of pages. */
  totalPages: number;
  /** Called with the newly selected page. */
  onChange: (page: number) => void;
  /** Accessible name for the nav landmark. @default 'Pagination' */
  'aria-label'?: string;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  onChange,
  'aria-label': ariaLabel = 'Pagination',
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label={ariaLabel} className={cn('flex flex-wrap items-center gap-1', className)}>
      <p className="sr-only">
        Page {page} of {totalPages}
      </p>
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className={pageButtonClasses}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Previous</span>
      </button>
      {buildPages(page, totalPages).map((entry, index) =>
        entry === 'ellipsis' ? (
          <span
            key={`ellipsis-${index}`}
            aria-hidden="true"
            className="px-1 text-sm leading-9 text-muted"
          >
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            onClick={() => onChange(entry)}
            aria-current={entry === page ? 'page' : undefined}
            aria-label={`Page ${entry}`}
            className={cn(
              pageButtonClasses,
              entry === page &&
                'border-brand bg-brand font-bold text-white hover:border-brand hover:bg-brand-hover hover:text-white',
            )}
          >
            {entry}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
        className={pageButtonClasses}
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
}
