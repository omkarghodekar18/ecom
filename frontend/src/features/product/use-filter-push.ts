'use client';

// Navigation helper for URL-driven filtering: pushes a new FilterState into
// the current URL (scroll disabled) so the server re-renders the listing —
// filtering stays SSR'd and SEO-safe (spec 6.3 / Section 13).
import { usePathname, useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { buildQueryString, type FilterState } from '@/lib/filter-url';

export interface FilterPush {
  /** Pushes `next` into the URL (page 1 clean URL when default state). */
  (next: FilterState): void;
  /** Pushes the default state (removes the whole query string). */
  reset(): void;
}

export function useFilterPush(): FilterPush {
  const router = useRouter();
  const pathname = usePathname();

  const push = useCallback(
    (next: FilterState) => {
      const qs = buildQueryString(next);
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const reset = useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [router, pathname]);

  return Object.assign(push, { reset });
}
