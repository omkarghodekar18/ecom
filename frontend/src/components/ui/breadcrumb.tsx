'use client';

import { ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';

/** One breadcrumb step; the last item is always rendered as the current page. */
export interface BreadcrumbItem {
  label: string;
  /** Link target; ignored on the last (current) item. */
  href?: string;
}

/**
 * Breadcrumb bar: an orange back-arrow + "Back" button (history back, falling
 * back to the first item's `href` when there is no history), a thin vertical
 * divider, then the trail separated by chevron icons. The last item is the
 * current page (`aria-current="page"`, no link); links render in brand orange
 * with a hover underline.
 *
 * @example
 * <Breadcrumb items={[{ label: 'Homepage', href: '/in/en' }, { label: 'Centre drills' }]} />
 */
export interface BreadcrumbProps {
  /** Ordered trail, first item is the root. */
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  const router = useRouter();

  if (items.length === 0) return null;
  const first = items[0];

  const handleBack = () => {
    // Fall back to the first item's href when there is no history to go back to.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else if (first?.href) {
      router.push(first.href);
    }
  };

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-3 text-sm', className)}>
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline focus-visible:outline-none"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>
      <span className="h-4 w-px shrink-0 bg-line" aria-hidden="true" />
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {isLast ? (
                <span aria-current="page" className="font-medium text-ink">
                  {item.label}
                </span>
              ) : item.href ? (
                <Link href={item.href} className="text-brand hover:underline focus-visible:outline-none">
                  {item.label}
                </Link>
              ) : (
                <span className="text-muted">{item.label}</span>
              )}
              {!isLast ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
