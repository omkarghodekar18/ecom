// PDP loading skeleton (spec 6.4): reserved gallery square + buy-box lines +
// tab strip, all aria-hidden with a status role for screen readers.
import { Skeleton, SkeletonText } from '@/components/ui';

export default function PdpLoading() {
  return (
    <div className="page-container py-4 lg:py-6" role="status" aria-live="polite">
      <span className="sr-only">Loading product…</span>
      <div className="flex gap-2" aria-hidden="true">
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] xl:gap-10">
        <div className="flex flex-col gap-3 lg:flex-row-reverse">
          <Skeleton className="aspect-square w-full" />
          <div className="flex gap-2 overflow-hidden lg:w-20 lg:flex-col">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-20 shrink-0" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-4/5" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-52" />
          <div className="flex flex-wrap gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 min-w-12" />
            ))}
          </div>
          <Skeleton className="h-9 w-44" />
          <SkeletonText lines={2} />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
      <div className="mt-10" aria-hidden="true">
        <Skeleton className="h-11 w-full max-w-2xl" />
      </div>
    </div>
  );
}
