// Search results listing block (spec 6.5): the category listing's composition
// with search-specific copy and the exact-article fast path (spec 6.5: when q
// IS an article number, offer a direct jump to that PDP). Server component.
import { ArrowRight, CircleCheck } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';
import { routes } from '@/config/routes';
import { buildQueryString, isFiltered, type FilterState } from '@/lib/filter-url';
import type { BrandDto, CategoryAttributeDto } from '@/shared/dto/catalog.dto';
import type { SearchResponseDto } from '@/shared/dto/search.dto';
import { ActiveFilterChips } from '@/features/product/active-filter-chips';
import { FilterBar } from '@/features/product/filter-bar';
import { ListingList } from '@/features/product/listing-list';
import { ListingPagination } from '@/features/product/listing-pagination';
import { ListingTiles } from '@/features/product/listing-tiles';
import { ListingToolbar } from '@/features/product/listing-toolbar';
import type { ListingView } from '@/features/product/view';

export interface SearchListingProps {
  /** The trimmed search term. */
  q: string;
  defs: CategoryAttributeDto[];
  brands: BrandDto[];
  state: FilterState;
  listing: SearchResponseDto;
  totalPages: number;
  view: ListingView;
  locale: string;
}

export function SearchListing({
  q,
  defs,
  brands,
  state,
  listing,
  totalPages,
  view,
  locale,
}: SearchListingProps) {
  const filtered = isFiltered(state);
  const isEmpty = listing.items.length === 0;
  // Exact-article fast path: link the owning product when it is on this page
  // (with the default relevance sort the exact hit ranks first).
  const exactItem =
    listing.exactArticleNo !== null && listing.exactArticleNo !== undefined
      ? listing.items.find((item) => item.firstArticleNo === listing.exactArticleNo)
      : undefined;
  const searchHref = routes(locale).search;

  return (
    <section id="results" aria-label="Products" className="mt-8 scroll-mt-36">
      <h2 className="text-base font-bold text-ink">Filter &amp; Sort</h2>
      <div className="mt-3">
        <FilterBar defs={defs} brands={brands} state={state} total={listing.total} countPath="/search" />
      </div>

      {exactItem ? (
        <div
          role="note"
          aria-label="Exact article number match"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-tile border border-brand/40 bg-brand/5 px-4 py-3"
        >
          <p className="flex items-center gap-2 text-sm text-ink">
            <CircleCheck className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            <span>
              <strong className="font-bold">{exactItem.name}</strong> — exact article number match
              for <strong className="font-bold">{listing.exactArticleNo}</strong>
            </span>
          </p>
          <Button
            variant="link"
            href={routes(locale).product(exactItem.slug, listing.exactArticleNo!)}
            className="h-auto p-0 text-sm font-bold"
          >
            Go to product
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}

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
            <Button
              variant="outline"
              href={`${searchHref}?q=${encodeURIComponent(q)}`}
            >
              Clear all filters
            </Button>
          </EmptyState>
        ) : (
          <EmptyState
            className="mt-6"
            title={`No products found for “${q}”`}
            description="Check the spelling, try a more general term, or search by article number or EAN."
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
        basePath={searchHref}
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
