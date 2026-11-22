import type { AvailabilityTone } from '@/lib/format';
import { cn } from '@/lib/cn';

/** Dot sizes; md matches the listing-page availability line. */
export type AvailabilityDotSize = 'sm' | 'md' | 'lg';

const toneClasses: Record<AvailabilityTone, string> = {
  green: 'bg-stock-green',
  amber: 'bg-stock-amber',
  red: 'bg-stock-red',
};

const dotSizes: Record<AvailabilityDotSize, string> = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
};

/**
 * Coloured stock-availability indicator: a green/amber/red dot next to a
 * label (e.g. "In stock", "Available in 11–14 working days"). The dot itself
 * is decorative — the label carries the meaning for screen readers.
 *
 * @example <AvailabilityDot tone="green" label="In stock" />
 */
export interface AvailabilityDotProps {
  /** Colour tone; derive with `availabilityInfo()` from `@/lib/format`. */
  tone: AvailabilityTone;
  /** Text next to the dot, e.g. "Available in 11-14 working days". */
  label: string;
  /** Dot size. @default 'md' */
  size?: AvailabilityDotSize;
  className?: string;
}

export function AvailabilityDot({ tone, label, size = 'md', className }: AvailabilityDotProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm text-ink', className)}>
      <span
        aria-hidden="true"
        className={cn('inline-block shrink-0 rounded-full', dotSizes[size], toneClasses[tone])}
      />
      {label}
    </span>
  );
}
