// Filter/listing URL state ↔ query-string codec (spec 6.3 + Section 12 URL
// contract: `?brand=garant,holex&dc_min=0.5&dc_max=3&inStock=true&sort=price_asc&page=2`).
// Pure functions on URLSearchParams — no React/Next imports, fully unit-testable.
// The category page owns the state; interactive listing components push new
// states into the URL so filtering stays server-rendered and SEO-safe.

/** Allowed sort keys (mirrors the backend listing contract). */
export const SORT_VALUES = [
  'relevance',
  'price_asc',
  'price_desc',
  'name',
  'bestseller',
  'newest',
] as const;
export type SortValue = (typeof SORT_VALUES)[number];

export const DEFAULT_SORT: SortValue = 'relevance';

/** Page-size selector options (spec 6.3). */
export const PAGE_SIZE_OPTIONS = [24, 48, 96] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSizeOption = 24;

/** Selected values of one attribute filter: value list (ENUM/STRING/BOOLEAN) or numeric range. */
export interface AttrFilterValue {
  values?: string[];
  min?: number;
  max?: number;
}

/** Complete listing state encoded in the URL query string. */
export interface FilterState {
  brand: string[];
  inStock: boolean;
  sort: SortValue;
  page: number;
  pageSize: PageSizeOption;
  attrs: Record<string, AttrFilterValue>;
  /**
   * Free-text search term carried along every filter interaction (search
   * pages only; category pages never set it). Encoded as `q` in URLs and API
   * queries so filtering a search result keeps the term. Not a "filter":
   * isFiltered() ignores it and Clear-all keeps it.
   */
  q?: string;
}

/** Minimal shape of a category attribute definition needed for parsing
 *  (structurally compatible with the shared CategoryAttributeDto). */
export interface FilterDef {
  key: string;
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'ENUM';
  filterWidget?: 'CHECKBOX' | 'RANGE' | 'DROPDOWN';
}

/** Fresh default state (page 1, no filters, relevance sort). */
export function defaultFilterState(): FilterState {
  return {
    brand: [],
    inStock: false,
    sort: DEFAULT_SORT,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    attrs: {},
  };
}

/** Splits a comma-joined value list, trims, drops empties and duplicates. */
function splitList(raw: string): string[] {
  return [...new Set(raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0))];
}

/** BOOLEAN filters accept only 'true'/'false' (backend contract). */
function splitBooleanList(raw: string): string[] {
  return splitList(raw).filter((v) => v === 'true' || v === 'false');
}

/**
 * Reads one logical parameter. Repeated keys (`?brand=a&brand=b`) behave like
 * comma-joined values, mirroring the backend's query flattening.
 */
function paramValue(params: URLSearchParams, key: string): string | undefined {
  const joined = params.getAll(key).join(',');
  return joined.length > 0 ? joined : undefined;
}

function numberParam(params: URLSearchParams, key: string): number | undefined {
  const raw = paramValue(params, key);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Compact number formatting without float noise (0.1+0.2 → 0.3). */
function formatNumber(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

/**
 * Parses URL search params into a `FilterState`, validating attribute keys
 * against `filterDefs` (unknown attribute params are IGNORED — the backend
 * would reject them with a 400). `brand`, `inStock`, `sort`, `page` and
 * `pageSize` are always parsed; every other unknown param is ignored too.
 */
export function parseFilterParams(
  searchParams: URLSearchParams,
  filterDefs: readonly FilterDef[],
): FilterState {
  const state = defaultFilterState();

  const brand = paramValue(searchParams, 'brand');
  if (brand !== undefined) state.brand = splitList(brand);

  const inStock = paramValue(searchParams, 'inStock');
  state.inStock = inStock === 'true' || inStock === '1';

  const sort = paramValue(searchParams, 'sort');
  if (sort !== undefined && (SORT_VALUES as readonly string[]).includes(sort)) {
    state.sort = sort as SortValue;
  }

  const page = numberParam(searchParams, 'page');
  if (page !== undefined && Number.isInteger(page) && page >= 1) state.page = page;

  const pageSize = numberParam(searchParams, 'pageSize');
  if (
    pageSize !== undefined &&
    Number.isInteger(pageSize) &&
    (PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSize)
  ) {
    state.pageSize = pageSize as PageSizeOption;
  }

  // Free-text term (search pages): kept verbatim after trimming; the search
  // page guards the 2–100 length contract before calling the API.
  const q = paramValue(searchParams, 'q');
  if (q !== undefined) {
    const trimmed = q.trim();
    if (trimmed.length > 0) state.q = trimmed;
  }

  for (const def of filterDefs) {
    if (def.type === 'NUMBER') {
      const min = numberParam(searchParams, `${def.key}_min`);
      const max = numberParam(searchParams, `${def.key}_max`);
      if (min !== undefined || max !== undefined) {
        state.attrs[def.key] = {
          ...(min !== undefined ? { min } : {}),
          ...(max !== undefined ? { max } : {}),
        };
      }
      continue;
    }
    const raw = paramValue(searchParams, def.key);
    if (raw === undefined) continue;
    const values = def.type === 'BOOLEAN' ? splitBooleanList(raw) : splitList(raw);
    if (values.length > 0) state.attrs[def.key] = { values };
  }
  return state;
}

/**
 * Encodes a state into a query string WITHOUT the leading '?'. Returns ''
 * for the default state (clean canonical URLs).
 */
export function buildQueryString(state: FilterState): string {
  const params = new URLSearchParams();
  if (state.q !== undefined) params.set('q', state.q);
  if (state.brand.length > 0) params.set('brand', state.brand.join(','));
  if (state.inStock) params.set('inStock', 'true');
  if (state.sort !== DEFAULT_SORT) params.set('sort', state.sort);
  if (state.page > 1) params.set('page', String(state.page));
  if (state.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(state.pageSize));
  for (const [key, value] of Object.entries(state.attrs)) {
    if (value.values !== undefined && value.values.length > 0) {
      params.set(key, value.values.join(','));
    }
    if (value.min !== undefined) params.set(`${key}_min`, formatNumber(value.min));
    if (value.max !== undefined) params.set(`${key}_max`, formatNumber(value.max));
  }
  return params.toString();
}

/**
 * Whether any "meaningful" filter is active (brand / inStock / attribute
 * filters / non-default sort). A page number or page-size alone does NOT
 * count — pagination keeps its self-canonical URL (spec 13.3).
 */
export function isFiltered(state: FilterState): boolean {
  return (
    state.brand.length > 0 ||
    state.inStock ||
    state.sort !== DEFAULT_SORT ||
    Object.keys(state.attrs).length > 0
  );
}

/** Number of active filter selections — used for group badges and chips. */
export function activeFilterCount(state: FilterState): number {
  let count = state.brand.length + (state.inStock ? 1 : 0);
  for (const value of Object.values(state.attrs)) {
    count += value.values?.length ?? 0;
    if (value.min !== undefined) count += 1;
    if (value.max !== undefined) count += 1;
  }
  return count;
}

/**
 * Builds the query object for the listing API from a state (only non-default
 * options are sent; page/pageSize are always explicit).
 */
export function toApiQuery(state: FilterState): Record<string, string> {
  const query: Record<string, string> = {
    page: String(state.page),
    pageSize: String(state.pageSize),
  };
  if (state.q !== undefined) query.q = state.q;
  if (state.sort !== DEFAULT_SORT) query.sort = state.sort;
  if (state.inStock) query.inStock = 'true';
  if (state.brand.length > 0) query.brand = state.brand.join(',');
  for (const [key, value] of Object.entries(state.attrs)) {
    if (value.values !== undefined && value.values.length > 0) {
      query[key] = value.values.join(',');
    }
    if (value.min !== undefined) query[`${key}_min`] = formatNumber(value.min);
    if (value.max !== undefined) query[`${key}_max`] = formatNumber(value.max);
  }
  return query;
}

/** Next.js `searchParams` record → URLSearchParams (repeated keys preserved). */
export function recordToSearchParams(
  record: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, entry);
    } else {
      params.append(key, value);
    }
  }
  return params;
}
