'use client';

// "Filter & Sort" bar (spec 6.3): a dismissible "New: Search the filters now."
// callout, a Sorting select, one dropdown button per filter group (capped at
// ~10, immediate URL apply on every change) and an "All filters" button that
// opens the full-height filter drawer. Sticky below the page header on
// desktop.
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DismissiblePopover, Popover, PopoverContent, PopoverTrigger, Select } from '@/components/ui';
import type { AttrFilterValue, FilterState, SortValue } from '@/lib/filter-url';
import { SORT_VALUES } from '@/lib/filter-url';
import type { BrandDto, CategoryAttributeDto } from '@/shared/dto/catalog.dto';
import { AttrFilterControl, CheckboxListControl } from './filter-controls';
import {
  barGroups,
  buildFilterGroups,
  withAttrFilterValue,
  withBrand,
  type FilterGroup,
} from './filter-groups';
import { FilterDrawer } from './filter-drawer';
import { useFilterPush } from './use-filter-push';

const SORT_LABELS: Record<SortValue, string> = {
  relevance: 'Relevance',
  price_asc: 'Price ascending',
  price_desc: 'Price descending',
  name: 'Name',
  bestseller: 'Bestseller',
  newest: 'Newest',
};

const SORT_OPTIONS = SORT_VALUES.map((value) => ({ value, label: SORT_LABELS[value] }));

/** Active selections of one group (for the button badge). */
function groupActiveCount(group: FilterGroup, state: FilterState): number {
  if (group.kind === 'brand') return state.brand.length;
  return group.attrs.reduce((sum, def) => {
    const value = state.attrs[def.key];
    return sum + (value?.values?.length ?? 0) + (value?.min !== undefined ? 1 : 0) + (value?.max !== undefined ? 1 : 0);
  }, 0);
}

const groupButtonClasses =
  'inline-flex h-10 items-center gap-1.5 rounded-btn border border-line bg-white px-3 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand data-[active=true]:border-brand data-[active=true]:text-brand';

export interface FilterBarProps {
  defs: CategoryAttributeDto[];
  brands: BrandDto[];
  state: FilterState;
  total: number;
  /** Listing endpoint path for the drawer's live-count query. */
  countPath: string;
}

export function FilterBar({ defs, brands, state, total, countPath }: FilterBarProps) {
  const push = useFilterPush();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const groups = useMemo(() => buildFilterGroups(defs, brands), [defs, brands]);
  const visibleGroups = useMemo(() => barGroups(groups), [groups]);

  const applyAttr = (key: string, value: AttrFilterValue | undefined) => {
    push(withAttrFilterValue(state, key, value));
  };

  return (
    <div className="lg:sticky lg:top-[119px] lg:z-20 lg:bg-white lg:py-2">
      <DismissiblePopover dismissKey="filters-search-hint" className="mb-3">
        Search the filters now.
      </DismissiblePopover>

      <div role="group" aria-label="Filter and sort" className="flex flex-wrap items-center gap-2">
        <Select
          label={<span className="sr-only">Sorting</span>}
          size="md"
          className="min-w-48"
          options={SORT_OPTIONS}
          value={state.sort}
          onValueChange={(sort) => push({ ...state, sort: sort as SortValue, page: 1 })}
        />

        {visibleGroups.map((group) => {
          const activeCount = groupActiveCount(group, state);
          return (
            <Popover key={group.id}>
              <PopoverTrigger asChild>
                <button type="button" className={groupButtonClasses} data-active={activeCount > 0}>
                  {group.label}
                  {activeCount > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-brand px-1 text-xs font-bold text-white">
                      {activeCount}
                    </span>
                  ) : null}
                  <ChevronDown className="h-4 w-4 text-muted" aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80" aria-label={`${group.label} filters`}>
                {group.kind === 'brand' ? (
                  <div className="space-y-2">
                    <p className="text-sm font-bold text-ink">Brand</p>
                    <CheckboxListControl
                      options={(group.brands ?? []).map((b) => ({ value: b.slug, label: b.name }))}
                      selected={state.brand}
                      onToggle={(slug) => push(withBrand(state, slug))}
                      listLabel="Brand"
                    />
                  </div>
                ) : (
                  <div className="space-y-5">
                    <p className="text-sm font-bold text-ink">{group.label}</p>
                    {group.attrs.map((def) => (
                      <AttrFilterControl
                        key={def.key}
                        def={def}
                        value={state.attrs[def.key]}
                        onValueChange={(next) => applyAttr(def.key, next)}
                      />
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          );
        })}

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-btn border border-line bg-white px-3 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
          aria-haspopup="dialog"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          All filters
        </button>
      </div>

      <FilterDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        groups={groups}
        state={state}
        total={total}
        countPath={countPath}
      />
    </div>
  );
}
