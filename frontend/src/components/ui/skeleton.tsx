import { cn } from '@/lib/cn';

/**
 * Base loading placeholder: pulsing grey tile. All skeleton parts are purely
 * decorative (`aria-hidden`) — wrap a loading list in an element with
 * `role="status"` and a visually hidden "Loading…" label.
 *
 * @example <Skeleton className="h-4 w-32" />
 */
export interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-btn bg-tile', className)} />;
}

/**
 * Multiple text lines; the last line is shorter to mimic a paragraph.
 *
 * @example <SkeletonText lines={3} />
 */
export interface SkeletonTextProps {
  /** Number of lines. @default 3 */
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn('h-3 animate-pulse rounded-btn bg-tile', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

/**
 * One product-list row skeleton: square image block plus two text lines
 * (name and meta).
 *
 * @example {loading && rows.map((r) => <SkeletonListRow key={r} />)}
 */
export interface SkeletonListRowProps {
  className?: string;
}

export function SkeletonListRow({ className }: SkeletonListRowProps) {
  return (
    <div className={cn('flex items-center gap-4', className)} aria-hidden="true">
      <div className="h-16 w-16 shrink-0 animate-pulse rounded-btn bg-tile" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
        <div className="h-3.5 w-3/4 animate-pulse rounded-btn bg-tile" />
        <div className="h-3 w-1/2 animate-pulse rounded-btn bg-tile" />
      </div>
    </div>
  );
}

/**
 * Product-card skeleton: bordered tile with an image block, a title line and
 * a price line.
 *
 * @example <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({length: 8}, (_, i) => <SkeletonCard key={i} />)}</div>
 */
export interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <div
      className={cn('flex flex-col gap-3 rounded-tile border border-line bg-white p-4', className)}
      aria-hidden="true"
    >
      <div className="aspect-square w-full animate-pulse rounded-btn bg-tile" />
      <div className="h-4 w-3/4 animate-pulse rounded-btn bg-tile" />
      <div className="h-3 w-1/2 animate-pulse rounded-btn bg-tile" />
    </div>
  );
}
