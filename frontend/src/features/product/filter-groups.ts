// Filter grouping + immutable state helpers shared by the filter bar, the
// filter drawer and the active-filter chips (spec 6.3). The brand group is
// always offered first; attribute defs are grouped by `groupName` and ordered
// by their smallest sortOrder.
import type { AttrFilterValue, FilterState } from '@/lib/filter-url';
import type { BrandDto, CategoryAttributeDto } from '@/shared/dto/catalog.dto';

/** Brand entry for the brand filter group (and chip labels). */
export interface BrandOption {
  slug: string;
  name: string;
}

export interface FilterGroup {
  /** Stable id: 'brand' or the group name. */
  id: string;
  /** Button/section label — the groupName, or 'Brand'. */
  label: string;
  kind: 'brand' | 'attribute';
  /** Filterable attribute defs of this group in sortOrder (empty for brand). */
  attrs: CategoryAttributeDto[];
  /** Brand options (only for the brand group). */
  brands?: BrandOption[];
}

/** Maximum number of group buttons in the filter bar (~10 per spec 6.3). */
export const MAX_BAR_GROUPS = 10;

function toBrandOptions(brands: BrandDto[]): BrandOption[] {
  return brands.map((b) => ({ slug: b.slug, name: b.name }));
}

/**
 * Builds the filter groups for a category: 'Brand' first, then one group per
 * `groupName` over the filterable attribute defs (non-filterable defs are
 * never offered in the UI).
 */
export function buildFilterGroups(
  defs: CategoryAttributeDto[],
  brands: BrandDto[],
): FilterGroup[] {
  const filterable = [...defs.filter((d) => d.isFilterable)].sort((a, b) => a.sortOrder - b.sortOrder);

  const byGroup = new Map<string, CategoryAttributeDto[]>();
  for (const def of filterable) {
    const bucket = byGroup.get(def.groupName) ?? [];
    bucket.push(def);
    byGroup.set(def.groupName, bucket);
  }

  const groups: FilterGroup[] = [
    { id: 'brand', label: 'Brand', kind: 'brand', attrs: [], brands: toBrandOptions(brands) },
  ];
  for (const [groupName, attrs] of byGroup) {
    groups.push({ id: groupName, label: groupName, kind: 'attribute', attrs });
  }
  return groups;
}

/** Groups shown as bar buttons (capped); the drawer shows all groups. */
export function barGroups(groups: FilterGroup[]): FilterGroup[] {
  return groups.slice(0, MAX_BAR_GROUPS);
}

/** Key → def lookup for chip labels and control rendering. */
export function attrDefIndex(defs: CategoryAttributeDto[]): Map<string, CategoryAttributeDto> {
  return new Map(defs.map((d) => [d.key, d]));
}

// ── immutable state updates (all reset pagination to page 1) ─────────────────

/** Toggles one value in a string list. */
export function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function withBrand(state: FilterState, slug: string): FilterState {
  return { ...state, brand: toggleValue(state.brand, slug), page: 1 };
}

export function withInStock(state: FilterState, inStock: boolean): FilterState {
  return { ...state, inStock, page: 1 };
}

/** Sets the value list of an attribute filter (empty list removes the filter). */
export function withAttrValues(state: FilterState, key: string, values: string[]): FilterState {
  const attrs = { ...state.attrs };
  if (values.length === 0) {
    delete attrs[key];
  } else {
    attrs[key] = { ...attrs[key], values };
  }
  return { ...state, attrs, page: 1 };
}

/**
 * Sets the numeric range of an attribute filter. `undefined` bounds remove
 * themselves; an entirely empty range removes the filter.
 */
export function withAttrRange(
  state: FilterState,
  key: string,
  min: number | undefined,
  max: number | undefined,
): FilterState {
  const attrs = { ...state.attrs };
  if (min === undefined && max === undefined) {
    delete attrs[key];
  } else {
    attrs[key] = { ...attrs[key], min, max };
  }
  return { ...state, attrs, page: 1 };
}

/**
 * Toggles one value inside an attribute's value list; returns `undefined`
 * when the list becomes empty (filter removed).
 */
export function toggleAttrValue(
  value: AttrFilterValue | undefined,
  option: string,
): AttrFilterValue | undefined {
  const next = toggleValue(value?.values ?? [], option);
  return next.length > 0 ? { values: next } : undefined;
}

/** Applies a whole `AttrFilterValue` (or removal) to a state. */
export function withAttrFilterValue(
  state: FilterState,
  key: string,
  value: AttrFilterValue | undefined,
): FilterState {
  const attrs = { ...state.attrs };
  const empty =
    value === undefined ||
    ((value.values === undefined || value.values.length === 0) &&
      value.min === undefined &&
      value.max === undefined);
  if (empty) {
    delete attrs[key];
  } else {
    attrs[key] = value;
  }
  return { ...state, attrs, page: 1 };
}
