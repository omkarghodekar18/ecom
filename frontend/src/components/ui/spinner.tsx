import { cn } from '@/lib/cn';

/** Spinner diameters: sm 16px, md 24px, lg 32px. */
const spinnerSizes = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]',
} as const;

/**
 * CSS border-based spinner in the brand orange with a screen-reader-visible
 * "Loading" status. Drop it inside buttons or centered on loading areas.
 *
 * @example <Spinner size="sm" />
 */
export interface SpinnerProps {
  /** @default 'md' */
  size?: keyof typeof spinnerSizes;
  /** Screen-reader label. @default 'Loading' */
  label?: string;
  className?: string;
}

export function Spinner({ size = 'md', label = 'Loading', className }: SpinnerProps) {
  return (
    <span role="status" className="inline-flex">
      <span
        aria-hidden="true"
        className={cn(
          'inline-block animate-spin rounded-full border-brand border-t-transparent',
          spinnerSizes[size],
          className,
        )}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
