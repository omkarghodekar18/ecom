'use client';

import { ChevronsUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { EmptyState } from './empty-state';
import { Pagination } from './pagination';

/** Active sort descriptor. */
export interface DataTableSort {
  key: string;
  dir: 'asc' | 'desc';
}

/** Column definition; `render` controls the cell content. */
export interface DataTableColumn<Row> {
  key: string;
  header: ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  render?: (row: Row, index: number) => ReactNode;
  className?: string;
  headerClassName?: string;
}

/**
 * Generic fully-controlled admin table: sticky header (sticks inside the
 * scroll area), zebra rows (`odd:bg-tile/50`), sortable columns, skeleton
 * rows while loading, error and empty slots, optional row click and an
 * optional pagination footer (rendered when `page`, `total` and
 * `onPageChange` are all provided). The table does NOT fetch data — feed it
 * rows and state descriptors.
 *
 * @example
 * <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} sort={sort} onSortChange={setSort} page={page} total={total} onPageChange={setPage} />
 */
export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  loading?: boolean;
  /** Custom empty slot; defaults to a muted "No results" EmptyState. */
  emptyState?: ReactNode;
  /** Error node rendered in a red alert box instead of the table. */
  error?: ReactNode;
  onRowClick?: (row: Row) => void;
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort) => void;
  page?: number;
  /** Page size used for skeleton rows and total-page math. @default 20 */
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  /** Classes for the scroll area (its height makes the sticky header stick). @default 'max-h-[70vh]' */
  scrollClassName?: string;
  className?: string;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyState,
  error,
  onRowClick,
  sort,
  onSortChange,
  page,
  pageSize = 20,
  total,
  onPageChange,
  scrollClassName = 'max-h-[70vh]',
  className,
}: DataTableProps<Row>) {
  const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

  const handleSort = (key: string) => {
    if (!onSortChange) return;
    const dir: 'asc' | 'desc' = sort?.key === key && sort.dir === 'asc' ? 'desc' : 'asc';
    onSortChange({ key, dir });
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: Row) => {
    if (!onRowClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick(row);
    }
  };

  const showPagination = page !== undefined && total !== undefined && onPageChange !== undefined;
  const totalPages = showPagination ? Math.max(1, Math.ceil(total / Math.max(pageSize, 1))) : 1;
  const skeletonCount = Math.min(pageSize, 10);

  if (error) {
    return (
      <div
        role="alert"
        className={cn(
          'rounded-btn border border-stock-red bg-stock-red/10 p-4 text-sm text-ink',
          className,
        )}
      >
        {error}
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        className={cn(
          'slim-scrollbar overflow-auto rounded-tile border border-line',
          scrollClassName,
        )}
      >
        {/* border-separate keeps cell borders attached to the sticky header cells. */}
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {columns.map((col) => {
                const isSorted = sort?.key === col.key;
                const SortIcon = isSorted ? (sort?.dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={isSorted ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn(
                      'sticky top-0 z-10 border-b border-line bg-white px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-muted',
                      alignClass[col.align ?? 'left'],
                      col.headerClassName,
                    )}
                  >
                    {col.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className={cn(
                          'inline-flex items-center gap-1 hover:text-brand focus-visible:outline-none',
                          isSorted && 'text-brand',
                          alignClass[col.align ?? 'left'],
                        )}
                      >
                        {col.header}
                        <SortIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: skeletonCount }).map((_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`} className="odd:bg-tile/50">
                    {columns.map((col) => (
                      <td key={col.key} className="px-3 py-3">
                        <div
                          className={cn(
                            'h-4 animate-pulse rounded-btn bg-tile',
                            rowIndex % 2 ? 'w-3/4' : 'w-1/2',
                          )}
                          aria-hidden="true"
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.length === 0
                ? (
                    <tr>
                      <td colSpan={columns.length} className="px-3 py-3">
                        {emptyState ?? <EmptyState title="No results" description="Nothing to show yet." />}
                      </td>
                    </tr>
                  )
                : rows.map((row, index) => {
                    const isLastRow = index === rows.length - 1;
                    return (
                      <tr
                        key={rowKey(row)}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        onKeyDown={onRowClick ? (e) => handleRowKeyDown(e, row) : undefined}
                        tabIndex={onRowClick ? 0 : undefined}
                        className={cn(
                          'odd:bg-tile/50 even:bg-white',
                          onRowClick && 'cursor-pointer hover:bg-tile',
                        )}
                      >
                        {columns.map((col) => (
                          <td
                            key={col.key}
                            className={cn(
                              'px-3 py-2.5 text-ink',
                              !isLastRow && 'border-b border-line',
                              alignClass[col.align ?? 'left'],
                              col.className,
                            )}
                          >
                            {col.render ? col.render(row, index) : String(row[col.key as keyof Row] ?? '')}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
          </tbody>
        </table>
      </div>
      {showPagination ? (
        <Pagination page={page} totalPages={totalPages} onChange={onPageChange} className="mt-4 justify-end" />
      ) : null}
    </div>
  );
}

/** Managed state object for `useDataTableState`. */
export interface DataTableState {
  page: number;
  pageSize: number;
  sort: DataTableSort | null;
  search: string;
}

const DEFAULT_STATE: DataTableState = { page: 1, pageSize: 20, sort: null, search: '' };

/**
 * Manages `{ page, pageSize, sort, search }` in one object and mirrors every
 * change into the URL query (`page`, `pageSize`, `sort` as `key:dir`,
 * `search`) via `history.replaceState` — no navigation, no route refetch.
 * Initial values are hydrated from the URL after mount; unrelated query
 * params are preserved. Changing `search`, `pageSize` or the sort resets the
 * page to 1.
 *
 * @example
 * const { state, setPage, toggleSort } = useDataTableState();
 */
export function useDataTableState(initial?: Partial<DataTableState>) {
  const initialRef = useRef(initial);
  const [state, setState] = useState<DataTableState>({ ...DEFAULT_STATE, ...initial });
  const hydratedRef = useRef(false);
  const skipFirstSyncRef = useRef(true);

  const syncUrl = useCallback((next: DataTableState) => {
    const params = new URLSearchParams(window.location.search);
    if (next.page > 1) params.set('page', String(next.page));
    else params.delete('page');
    if (next.pageSize !== DEFAULT_STATE.pageSize) params.set('pageSize', String(next.pageSize));
    else params.delete('pageSize');
    if (next.search) params.set('search', next.search);
    else params.delete('search');
    if (next.sort) params.set('sort', `${next.sort.key}:${next.sort.dir}`);
    else params.delete('sort');
    const query = params.toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  }, []);

  // Hydrate initial state from the URL once, after mount (SSR-safe).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next: DataTableState = { ...DEFAULT_STATE, ...initialRef.current };
    const page = Number(params.get('page'));
    if (Number.isFinite(page) && page >= 1) next.page = page;
    const pageSize = Number(params.get('pageSize'));
    if (Number.isFinite(pageSize) && pageSize >= 1) next.pageSize = pageSize;
    const search = params.get('search');
    if (search !== null) next.search = search;
    const sort = params.get('sort');
    if (sort) {
      const sep = sort.lastIndexOf(':');
      const key = sep > 0 ? sort.slice(0, sep) : '';
      const dir = sort.slice(sep + 1);
      if (key && (dir === 'asc' || dir === 'desc')) next.sort = { key, dir };
    }
    setState(next);
    hydratedRef.current = true;
  }, []);

  // Mirror state changes into the URL (skips the very first run so the
  // mount-pass state never clobbers URL params before hydration).
  useEffect(() => {
    if (skipFirstSyncRef.current) {
      skipFirstSyncRef.current = false;
      return;
    }
    if (!hydratedRef.current) return;
    syncUrl(state);
  }, [state, syncUrl]);

  const update = useCallback(
    (patch: Partial<DataTableState> | ((prev: DataTableState) => Partial<DataTableState>)) => {
      setState((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
    },
    [],
  );

  const setPage = useCallback((page: number) => update({ page }), [update]);
  const setPageSize = useCallback(
    (pageSize: number) => update({ pageSize, page: 1 }),
    [update],
  );
  const setSearch = useCallback((search: string) => update({ search, page: 1 }), [update]);
  const setSort = useCallback(
    (sort: DataTableSort | null) => update({ sort, page: 1 }),
    [update],
  );
  const toggleSort = useCallback(
    (key: string) =>
      update((prev) => ({
        sort:
          prev.sort?.key === key
            ? prev.sort.dir === 'asc'
              ? { key, dir: 'desc' }
              : null
            : { key, dir: 'asc' },
        page: 1,
      })),
    [update],
  );
  const reset = useCallback(() => {
    setState({ ...DEFAULT_STATE, ...initialRef.current });
  }, []);

  return { state, setPage, setPageSize, setSearch, setSort, toggleSort, reset };
}
