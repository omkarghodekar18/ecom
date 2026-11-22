'use client';

// Toolbar below the filter bar (spec 6.3): result count on the left; on the
// right the "In stock" toggle (URL param) and the List/Tile view toggle
// (cookie 'th:view' — switching re-renders the server page via refresh).
import { useRouter } from 'next/navigation';
import { LayoutGrid, List } from 'lucide-react';
import { Checkbox } from '@/components/ui';
import type { FilterState } from '@/lib/filter-url';
import { withInStock } from './filter-groups';
import { useFilterPush } from './use-filter-push';
import { VIEW_COOKIE, type ListingView } from './view';

export interface ListingToolbarProps {
  total: number;
  state: FilterState;
  view: ListingView;
}

export function ListingToolbar({ total, state, view }: ListingToolbarProps) {
  const push = useFilterPush();
  const router = useRouter();

  const setView = (next: ListingView) => {
    if (next === view) return;
    document.cookie = `${VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  const toggleClasses =
    'inline-flex h-10 w-10 items-center justify-center transition-colors focus-visible:outline-none';

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <p className="text-sm font-bold text-ink" aria-live="polite">
        {total} {total === 1 ? 'product' : 'products'}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Checkbox
          label="In stock"
          checked={state.inStock}
          onCheckedChange={(checked) => push(withInStock(state, checked === true))}
        />
        <div
          role="group"
          aria-label="Product view"
          className="flex overflow-hidden rounded-btn border border-line"
        >
          <button
            type="button"
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            aria-label="List view"
            className={`${toggleClasses} ${
              view === 'list'
                ? 'bg-brand text-white'
                : 'bg-white text-ink hover:bg-tile hover:text-brand'
            }`}
          >
            <List className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setView('tile')}
            aria-pressed={view === 'tile'}
            aria-label="Tile view"
            className={`${toggleClasses} border-l border-line ${
              view === 'tile'
                ? 'bg-brand text-white'
                : 'bg-white text-ink hover:bg-tile hover:text-brand'
            }`}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
