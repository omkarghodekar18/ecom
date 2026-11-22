import { Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Badge variants per the listing-page reference. */
export type BadgeVariant = 'bestseller' | 'brand' | 'count' | 'neutral';

const variantClasses: Record<BadgeVariant, string> = {
  bestseller: 'border border-stock-amber/40 bg-stock-amber/15 text-ink',
  brand: 'bg-navy text-white uppercase tracking-wide',
  count: 'bg-tile text-ink font-medium',
  neutral: 'border border-line bg-white text-ink',
};

/**
 * Small inline badge/label. `bestseller` defaults its text to "Bestseller"
 * (with a star icon); `brand` renders the navy uppercase brand badge (e.g.
 * "GARANT"); `count` renders the grey chip (e.g. "11 variants"); `neutral`
 * is a plain bordered tag.
 *
 * @example <Badge variant="bestseller" />
 * @example <Badge variant="brand">Garant</Badge>
 * @example <Badge variant="count">{count} variants</Badge>
 */
export interface BadgeProps {
  /** Visual variant. @default 'neutral' */
  variant?: BadgeVariant;
  /** Badge content; required for every variant except `bestseller`. */
  children?: ReactNode;
  className?: string;
}

export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  const content =
    children ?? (variant === 'bestseller' ? ('Bestseller' as const) : undefined);
  if (content === undefined) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-btn px-2 py-0.5 text-xs font-bold leading-4',
        variantClasses[variant],
        className,
      )}
    >
      {variant === 'bestseller' ? (
        <Star className="h-3 w-3 fill-stock-amber text-stock-amber" aria-hidden="true" />
      ) : null}
      {content}
    </span>
  );
}
