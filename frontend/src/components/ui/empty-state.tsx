import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Centered muted placeholder for empty content areas: icon, title,
 * description and an optional action slot (e.g. a "Reset filters" button).
 *
 * @example
 * <EmptyState title="No products match your filters" description="Try removing some filters.">
 *   <Button variant="outline" onClick={reset}>Reset filters</Button>
 * </EmptyState>
 */
export interface EmptyStateProps {
  /** Icon node; defaults to a muted inbox glyph. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Action slot rendered below the description. */
  children?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, children, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-4 py-12 text-center',
        className,
      )}
    >
      <div className="text-muted" aria-hidden="true">
        {icon ?? <Inbox className="h-10 w-10" strokeWidth={1.5} />}
      </div>
      <div className="space-y-1">
        <p className="text-base font-bold text-ink">{title}</p>
        {description ? (
          <p className="mx-auto max-w-md text-sm leading-6 text-muted">{description}</p>
        ) : null}
      </div>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}
