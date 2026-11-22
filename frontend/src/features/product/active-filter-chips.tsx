'use client';

// "Active filters" chip row (spec 6.3): one removable chip per selected value
// (brand names resolved via the brand list, attribute labels via the filter
// defs) plus a "Clear all" chip. Every removal pushes the updated state into
// the URL — the server re-renders the listing.
import { useMemo } from 'react';
import { Chip } from '@/components/ui';
import { defaultFilterState, type FilterState } from '@/lib/filter-url';
import type { BrandDto, CategoryAttributeDto } from '@/shared/dto/catalog.dto';
import {
  attrDefIndex,
  withAttrRange,
  withAttrValues,
  withBrand,
  withInStock,
} from './filter-groups';
import { useFilterPush } from './use-filter-push';

interface ActiveChip {
  key: string;
  label: string;
  remove: () => void;
}

export interface ActiveFilterChipsProps {
  state: FilterState;
  defs: CategoryAttributeDto[];
  brands: BrandDto[];
}

export function ActiveFilterChips({ state, defs, brands }: ActiveFilterChipsProps) {
  const push = useFilterPush();

  const defIndex = useMemo(() => attrDefIndex(defs), [defs]);
  const brandNames = useMemo(() => new Map(brands.map((b) => [b.slug, b.name])), [brands]);

  const chips = useMemo<ActiveChip[]>(() => {
    const result: ActiveChip[] = [];

    for (const slug of state.brand) {
      result.push({
        key: `brand:${slug}`,
        label: `Brand: ${brandNames.get(slug) ?? slug}`,
        remove: () => push(withBrand(state, slug)),
      });
    }

    if (state.inStock) {
      result.push({
        key: 'inStock',
        label: 'In stock',
        remove: () => push(withInStock(state, false)),
      });
    }

    for (const [key, value] of Object.entries(state.attrs)) {
      const def = defIndex.get(key);
      const label = def?.label ?? key;
      if (value.values) {
        for (const option of value.values) {
          result.push({
            key: `${key}:${option}`,
            label: `${label}: ${option === 'true' ? 'Yes' : option}`,
            remove: () =>
              push(withAttrValues(state, key, value.values?.filter((v) => v !== option) ?? [])),
          });
        }
      }
      if (value.min !== undefined || value.max !== undefined) {
        const rangeText = `${value.min ?? '…'}\u2013${value.max ?? '…'}${def?.unit ? ` ${def.unit}` : ''}`;
        result.push({
          key: `${key}:range`,
          label: `${label}: ${rangeText}`,
          remove: () => push(withAttrRange(state, key, undefined, undefined)),
        });
      }
    }
    return result;
    // Chips only depend on the committed state + defs/brands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, defIndex, brandNames]);

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      {chips.map((chip) => (
        <Chip key={chip.key} label={chip.label} onRemove={chip.remove} />
      ))}
      <Chip
        label="Clear all"
        selected
        removeLabel="Clear all filters"
        onRemove={() => push({ ...defaultFilterState(), q: state.q })}
      />
    </div>
  );
}
