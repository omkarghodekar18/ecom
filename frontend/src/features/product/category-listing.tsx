// Server-composed product listing block shared by leaf and non-leaf category
// pages (spec 6.2/6.3): "Filter & Sort" bar → toolbar (count + in-stock +
// view toggle) → active filter chips → list/tile results → pagination, plus
// the empty state.
import { Button, EmptyState } from '@/components/ui';
import { buildQueryString, isFiltered, type FilterState } from '@/lib/filter-url';
import type { BrandDto, CategoryAttributeDto } from '@/shared/dto/catalog.dto';
import type { ListingResponse } from '@/shared/dto/product.dto';
import { ActiveFilterChips } from './active-filter-chips';
import { FilterBar } from './filter-bar';
import { ListingList } from './listing-list';
import { ListingPagination } from './listing-pagination';
import { ListingTiles } from './listing-tiles';
import { ListingToolbar } from './listing-toolbar';
import type { ListingView } from './view';

export interface CategoryListingProps {
  categoryCode: string;
  defs: CategoryAttributeDto[];
  brands: BrandDto[];
  state: FilterState;
  listing: ListingResponse;
  totalPages: number;
  view: ListingView;
  locale: string;
  /** Clean (unfiltered) category URL — target of "Clear all filters". */
  clearHref: string;
  /** Canonical category path, e.g. "/in/en/machining/drilling/drills/c/10-01-01-00-00". */
  categoryHref: string;
}

export function CategoryListing({
  categoryCode,
  defs,
  brands,
  state,
  listing,
  totalPages,
  view,
  locale,
  clearHref,
  categoryHref,
}: CategoryListingProps) {
  const filtered = isFiltered(state);
  const isEmpty = listing.items.length === 0;

  return (
    <section id="results" aria-label="Products" className="mt-8 scroll-mt-36">
      <h2 className="text-base font-bold text-ink">Filter &amp; Sort</h2>
      <div className="mt-3">
        <FilterBar
          defs={defs}
          brands={brands}
          state={state}
          total={listing.total}
          countPath={`/categories/${categoryCode}/products`}
        />
      </div>

      <div className="mt-4">
        <ListingToolbar total={listing.total} state={state} view={view} />
      </div>

      <div className="mt-4">
        <ActiveFilterChips state={state} defs={defs} brands={brands} />
      </div>

      {isEmpty ? (
        filtered ? (
          <EmptyState
            className="mt-6"
            title="No products match your filters"
            description="Try removing some filters or widening the selected values."
          >
            <Button variant="outline" href={clearHref}>
              Clear all filters
            </Button>
          </EmptyState>
        ) : (
          <EmptyState
            className="mt-6"
            title="No products available in this category yet"
            description="New products for this category are being added continuously. Check back soon."
          />
        )
      ) : view === 'tile' ? (
        <ListingTiles items={listing.items} locale={locale} />
      ) : (
        <ListingList items={listing.items} locale={locale} />
      )}

      <ListingPagination
        page={state.page}
        totalPages={totalPages}
        basePath={categoryHref}
        query={paginationQuery({ ...state, page: 1 })}
      />
    </section>
  );
}

/** Query-object form of a filter state (page excluded) for pagination links. */
function paginationQuery(state: FilterState): Record<string, string> | undefined {
  const qs = buildQueryString(state).replace(/^\?/, '');
  if (!qs) return undefined;
  return Object.fromEntries(new URLSearchParams(qs));
}
