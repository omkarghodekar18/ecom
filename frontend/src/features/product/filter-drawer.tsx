'use client';

// Full-height filter drawer (spec 6.3): slides in from the RIGHT (~420px),
// offers a search box that filters the facet list client-side, stacks all
// filter groups and applies the local draft with a live "Show X results"
// button (result count fetched debounced through TanStack Query).
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Drawer } from '@/components/ui';
import { apiFetch } from '@/lib/api-client';
import {
  buildQueryString,
  defaultFilterState,
  toApiQuery,
  type AttrFilterValue,
  type FilterState,
} from '@/lib/filter-url';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import type { ListingResponse } from '@/shared/dto/product.dto';
import {
  AttrFilterControl,
  CheckboxListControl,
  attrMatchesSearch,
  brandMatchesSearch,
  normalizeSearch,
  textMatches,
} from './filter-controls';
import { withAttrFilterValue, withBrand, type FilterGroup } from './filter-groups';
import { useFilterPush } from './use-filter-push';

/** Drawer slides from the right — keyframes scoped to this component. */
const SLIDE_KEYFRAMES =
  '@keyframes th-filters-in-right{from{transform:translateX(100%)}to{transform:translateX(0)}}' +
  '@keyframes th-filters-out-right{from{transform:translateX(0)}to{transform:translateX(100%)}}';

export interface FilterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All filter groups (not capped to the bar's ~10). */
  groups: FilterGroup[];
  /** Committed filter state (URL). */
  state: FilterState;
  /** Committed result total — fallback label before the live count loads. */
  total: number;
  /** Listing endpoint path for the live-count query (`/categories/:code/products` or `/search`). */
  countPath: string;
}

export function FilterDrawer({
  open,
  onOpenChange,
  groups,
  state,
  total,
  countPath,
}: FilterDrawerProps) {
  const push = useFilterPush();
  const [draft, setDraft] = useState<FilterState>(state);
  const [search, setSearch] = useState('');

  // Snapshot on open: the React-sanctioned "adjust state when a prop changes"
  // pattern (setState during render, no effect). While the overlay is open the
  // committed URL state cannot change, so `state` is only read on open.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(state);
      setSearch('');
    }
  }

  const debouncedDraft = useDebouncedValue(draft, 350);

  // Live result count for the draft state (pageSize=1 → cheap total lookup).
  // toApiQuery carries the draft's `q` too, so a search page's count preview
  // stays term-scoped.
  const { data: liveTotal, isFetching } = useQuery({
    queryKey: ['listing-count', countPath, buildQueryString(debouncedDraft)],
    queryFn: async () => {
      const { data } = await apiFetch<ListingResponse>(countPath, {
        query: { ...toApiQuery(debouncedDraft), pageSize: 1 },
      });
      return data.total;
    },
    enabled: open,
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });

  const applyDraftValue = (key: string, value: AttrFilterValue | undefined) => {
    setDraft((current) => withAttrFilterValue(current, key, value));
  };
  const toggleDraftBrand = (slug: string) => {
    setDraft((current) => withBrand(current, slug));
  };

  const q = normalizeSearch(search);
  const visibleGroups = useMemo(() => {
    return groups
      .map((group) =>
        group.kind === 'brand'
          ? group
          : { ...group, attrs: group.attrs.filter((def) => attrMatchesSearch(def, search)) },
      )
      .filter((group) => {
        if (q.length === 0) return true;
        if (group.kind === 'brand') {
          return (
            textMatches(group.label, q) ||
            (group.brands ?? []).some((b) => brandMatchesSearch(b.name, search))
          );
        }
        return group.attrs.length > 0;
      });
  }, [groups, search, q]);

  const apply = () => {
    push(draft);
    onOpenChange(false);
  };
  const clearAll = () => {
    // Clear the filters, never the search term (state.q survives).
    setDraft({ ...defaultFilterState(), q: draft.q });
    setSearch('');
  };

  const resultCount = liveTotal ?? total;

  return (
    <>
      <style>{SLIDE_KEYFRAMES}</style>
      {/* The shared Drawer primitive anchors left; reposition it to the right. */}
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title="Filters"
        className="left-auto right-0 w-[420px] data-[state=open]:animate-[th-filters-in-right_250ms_ease-out] data-[state=closed]:animate-[th-filters-out-right_200ms_ease-in]"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="sticky top-0 z-10 border-b border-line bg-white p-4">
            <label className="sr-only" htmlFor="filter-drawer-search">
              Search filters
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                id="filter-drawer-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search filters"
                autoComplete="off"
                className="h-10 w-full rounded-btn border border-line bg-white pl-10 pr-9 text-sm text-ink placeholder:text-muted focus:outline-none"
              />
              {search.length > 0 ? (
                <button
                  type="button"
                  aria-label="Clear filter search"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted transition-colors hover:bg-tile hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="slim-scrollbar flex-1 overflow-y-auto overscroll-contain p-4">
            {visibleGroups.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                No filters match &ldquo;{search}&rdquo;.
              </p>
            ) : (
              <div className="divide-y divide-line">
                {visibleGroups.map((group, index) => (
                  <section
                    key={group.id}
                    aria-label={group.label}
                    className={index === 0 ? 'pb-5' : 'py-5'}
                  >
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink">
                      {group.label}
                    </h3>
                    {group.kind === 'brand' ? (
                      <CheckboxListControl
                        options={(group.brands ?? []).map((b) => ({ value: b.slug, label: b.name }))}
                        selected={draft.brand}
                        onToggle={toggleDraftBrand}
                        searchQuery={search}
                        labelMatchesSearch={textMatches(group.label, q)}
                        listLabel="Brand"
                      />
                    ) : (
                      <div className="space-y-5">
                        {group.attrs.map((def) => (
                          <AttrFilterControl
                            key={def.key}
                            def={def}
                            value={draft.attrs[def.key]}
                            onValueChange={(next) => applyDraftValue(def.key, next)}
                            searchQuery={search}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 border-t border-line bg-white p-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearAll}
                className="h-12 shrink-0 rounded-btn border border-line bg-white px-4 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={apply}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-btn bg-brand px-4 text-sm font-bold text-white transition-colors hover:bg-brand-hover"
              >
                {isFetching ? (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                    aria-hidden="true"
                  />
                ) : null}
                Show {resultCount} results
              </button>
            </div>
          </div>
        </div>
      </Drawer>
    </>
  );
}
