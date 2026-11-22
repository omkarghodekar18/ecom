import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  activeFilterCount,
  buildQueryString,
  defaultFilterState,
  isFiltered,
  parseFilterParams,
  recordToSearchParams,
  toApiQuery,
  type FilterDef,
  type FilterState,
} from './filter-url';

const defs: FilterDef[] = [
  { key: 'coating', type: 'ENUM', filterWidget: 'CHECKBOX' },
  { key: 'tool_material', type: 'STRING', filterWidget: 'CHECKBOX' },
  { key: 'cutter_diameter', type: 'NUMBER', filterWidget: 'RANGE' },
  { key: 'coolant_through', type: 'BOOLEAN', filterWidget: 'CHECKBOX' },
  { key: 'din_standard', type: 'STRING', filterWidget: 'DROPDOWN' },
];

function parse(qs: string): FilterState {
  return parseFilterParams(new URLSearchParams(qs), defs);
}

describe('parseFilterParams', () => {
  it('returns the default state for an empty query', () => {
    const state = parse('');
    expect(state).toEqual(defaultFilterState());
    expect(state.attrs).toEqual({});
  });

  it('parses brand lists (comma-joined and repeated keys) with de-duplication', () => {
    expect(parse('brand=garant,holex').brand).toEqual(['garant', 'holex']);
    expect(parse('brand=garant&brand=holex').brand).toEqual(['garant', 'holex']);
    expect(parse('brand=garant,garant').brand).toEqual(['garant']);
    expect(parse('brand=').brand).toEqual([]);
    expect(parse('brand=%2C%2C').brand).toEqual([]);
  });

  it('parses inStock in both spellings and defaults to false', () => {
    expect(parse('inStock=true').inStock).toBe(true);
    expect(parse('inStock=1').inStock).toBe(true);
    expect(parse('inStock=false').inStock).toBe(false);
    expect(parse('').inStock).toBe(false);
  });

  it('validates sort against the known set', () => {
    expect(parse('sort=price_asc').sort).toBe('price_asc');
    expect(parse('sort=hacker').sort).toBe('relevance');
    expect(parse('sort=').sort).toBe('relevance');
  });

  it('validates page and pageSize', () => {
    expect(parse('page=3').page).toBe(3);
    expect(parse('page=0').page).toBe(1);
    expect(parse('page=-2').page).toBe(1);
    expect(parse('page=abc').page).toBe(1);
    expect(parse('page=1.5').page).toBe(1);
    expect(parse('pageSize=48').pageSize).toBe(48);
    expect(parse('pageSize=96').pageSize).toBe(96);
    expect(parse('pageSize=100').pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(parse('pageSize=abc').pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('parses enum/string value lists for known attribute keys', () => {
    const state = parse('coating=TiAlN,TiN&tool_material=HSS-E');
    expect(state.attrs.coating).toEqual({ values: ['TiAlN', 'TiN'] });
    expect(state.attrs.tool_material).toEqual({ values: ['HSS-E'] });
  });

  it('parses numeric ranges via key_min / key_max', () => {
    const state = parse('cutter_diameter_min=0.5&cutter_diameter_max=3');
    expect(state.attrs.cutter_diameter).toEqual({ min: 0.5, max: 3 });
    expect(parse('cutter_diameter_min=0.5').attrs.cutter_diameter).toEqual({ min: 0.5 });
    expect(parse('cutter_diameter_max=3').attrs.cutter_diameter).toEqual({ max: 3 });
  });

  it('ignores invalid range numbers', () => {
    expect(parse('cutter_diameter_min=abc&cutter_diameter_max=xyz').attrs).toEqual({});
  });

  it('ignores unknown attribute keys and unknown general params', () => {
    const state = parse('utm_source=mail&foo=bar&not_a_filter=1&coating=TiN');
    expect(state.attrs).toEqual({ coating: { values: ['TiN'] } });
  });

  it('ignores a bare value on a NUMBER attribute (only _min/_max are valid)', () => {
    expect(parse('cutter_diameter=5').attrs).toEqual({});
  });

  it('ignores range suffixes on non-NUMBER attributes', () => {
    expect(parse('coating_min=1&coating_max=2').attrs).toEqual({});
  });

  it('keeps only boolean-legal values for BOOLEAN attributes', () => {
    expect(parse('coolant_through=true').attrs.coolant_through).toEqual({ values: ['true'] });
    expect(parse('coolant_through=maybe').attrs).toEqual({});
  });
});

describe('buildQueryString', () => {
  it('returns an empty string for the default state', () => {
    expect(buildQueryString(defaultFilterState())).toBe('');
  });

  it('omits defaults and encodes lists and ranges', () => {
    const state: FilterState = {
      brand: ['garant', 'holex'],
      inStock: true,
      sort: 'price_asc',
      page: 2,
      pageSize: 48,
      attrs: {
        coating: { values: ['TiAlN', 'TiN'] },
        cutter_diameter: { min: 0.5, max: 3 },
      },
    };
    const qs = buildQueryString(state);
    expect(qs).toBe(
      'brand=garant%2Cholex&inStock=true&sort=price_asc&page=2&pageSize=48' +
        '&coating=TiAlN%2CTiN&cutter_diameter_min=0.5&cutter_diameter_max=3',
    );
  });

  it('round-trips through parseFilterParams', () => {
    const state: FilterState = {
      brand: ['garant'],
      inStock: true,
      sort: 'newest',
      page: 4,
      pageSize: 96,
      attrs: {
        coating: { values: ['TiAlN'] },
        tool_material: { values: ['HSS-E', 'Carbide'] },
        cutter_diameter: { min: 0.5, max: 12.5 },
        coolant_through: { values: ['true'] },
      },
    };
    const reloaded = parse(buildQueryString(state));
    expect(reloaded).toEqual(state);
  });

  it('round-trips the default state (empty string)', () => {
    expect(parse(buildQueryString(defaultFilterState()))).toEqual(defaultFilterState());
  });
});

describe('isFiltered / activeFilterCount', () => {
  it('page or pageSize alone do not count as filtered (canonical pagination)', () => {
    const state = { ...defaultFilterState(), page: 3, pageSize: 96 as const };
    expect(isFiltered(state)).toBe(false);
    expect(activeFilterCount(state)).toBe(0);
  });

  it('brand, inStock, attributes and non-default sort count as filtered', () => {
    expect(isFiltered({ ...defaultFilterState(), brand: ['garant'] })).toBe(true);
    expect(isFiltered({ ...defaultFilterState(), inStock: true })).toBe(true);
    expect(isFiltered({ ...defaultFilterState(), sort: 'name' })).toBe(true);
    expect(
      isFiltered({ ...defaultFilterState(), attrs: { coating: { values: ['TiN'] } } }),
    ).toBe(true);
    expect(isFiltered({ ...defaultFilterState(), attrs: { cutter_diameter: { min: 1 } } })).toBe(
      true,
    );
  });

  it('counts every active value plus one per range bound and inStock', () => {
    const state: FilterState = {
      ...defaultFilterState(),
      brand: ['garant', 'holex'],
      inStock: true,
      attrs: {
        coating: { values: ['TiAlN', 'TiN'] },
        cutter_diameter: { min: 0.5, max: 3 },
      },
    };
    expect(activeFilterCount(state)).toBe(7);
  });
});

describe('toApiQuery', () => {
  it('always sends explicit pagination but omits default options', () => {
    expect(toApiQuery(defaultFilterState())).toEqual({ page: '1', pageSize: '24' });
    const query = toApiQuery({
      ...defaultFilterState(),
      sort: 'price_desc',
      page: 2,
      inStock: true,
      brand: ['garant'],
      attrs: { cutter_diameter: { min: 0.5 } },
    });
    expect(query).toEqual({
      page: '2',
      pageSize: '24',
      sort: 'price_desc',
      inStock: 'true',
      brand: 'garant',
      cutter_diameter_min: '0.5',
    });
  });
});

describe('recordToSearchParams', () => {
  it('flattens the Next.js searchParams record', () => {
    const params = recordToSearchParams({
      brand: 'garant',
      page: undefined,
      coating: ['TiAlN', 'TiN'],
    });
    expect(params.getAll('brand')).toEqual(['garant']);
    expect(params.getAll('coating')).toEqual(['TiAlN', 'TiN']);
    expect(params.has('page')).toBe(false);
  });
});

describe('search term passthrough (q)', () => {
  it('parses and trims q; empty/whitespace q is dropped', () => {
    expect(parse('q=centre%20drill').q).toBe('centre drill');
    expect(parse('q=%20%20hss%20%20').q).toBe('hss');
    expect(parse('q=').q).toBeUndefined();
    expect(parse('q=%20%20').q).toBeUndefined();
    expect(parse('').q).toBeUndefined();
  });

  it('is not a filter: isFiltered/activeFilterCount ignore q', () => {
    const state = { ...defaultFilterState(), q: 'drill' };
    expect(isFiltered(state)).toBe(false);
    expect(activeFilterCount(state)).toBe(0);
  });

  it('survives buildQueryString and toApiQuery round-trips', () => {
    const state = { ...defaultFilterState(), q: 'centre drill', brand: ['garant'] };
    expect(buildQueryString(state)).toBe('q=centre+drill&brand=garant');
    expect(parse(buildQueryString(state))).toEqual(state);
    expect(toApiQuery(state)).toEqual({
      q: 'centre drill',
      page: '1',
      pageSize: '24',
      brand: 'garant',
    });
  });

  it('clearing filters keeps the term (Clear-all contract)', () => {
    const state = { ...defaultFilterState(), q: 'drill', brand: ['garant'], inStock: true };
    const cleared = { ...defaultFilterState(), q: state.q };
    expect(cleared.q).toBe('drill');
    expect(isFiltered(cleared)).toBe(false);
  });
});
