'use client';

// "Recently viewed" row (spec 6.4): per-browser list in localStorage
// ("th:recent"). The current product is pushed on mount (deduped, capped at
// 12). SSR/hydration render an empty list (store starts empty on both sides);
// the store update after mount re-renders the filled row — browser-specific
// state never leaks into server HTML.
import { useEffect } from 'react';
import { ListingCard } from '@/features/product/listing-card';
import { useRecentStore, type RecentEntry } from './recent-store';

export interface RecentlyViewedProps {
  /** The product currently on screen (pushed to the top of the list). */
  current: RecentEntry;
  locale: string;
}

export function RecentlyViewed({ current, locale }: RecentlyViewedProps) {
  const { entries, hydrate, push } = useRecentStore();

  useEffect(() => {
    hydrate();
    push(current);
    // `current` is a snapshot built once per product page — no re-push needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (entries.length === 0) return null;

  return (
    <section aria-labelledby="recent-heading" className="mt-12">
      <h2 id="recent-heading" className="text-lg font-bold text-ink">
        Recently viewed
      </h2>
      <ul className="slim-scrollbar mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
        {entries.map((entry) => (
          <li key={entry.id} className="w-[220px] shrink-0 snap-start sm:w-[240px]">
            <ListingCard product={entry} locale={locale} sizes="240px" />
          </li>
        ))}
      </ul>
    </section>
  );
}
