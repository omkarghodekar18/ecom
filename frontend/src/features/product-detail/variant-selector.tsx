'use client';

// Variant selector (spec 6.4): one row per variant axis; square option buttons
// (selected = orange fill, white text) with a small availability dot per option
// (green = some variant in stock, amber = lead time only, red = none).
// Combinations that don't exist for the current other-axis selection are
// disabled (client-side variant matrix).
import { cn } from '@/lib/cn';
import { LabelHtml } from './label-html';
import { isOptionSelectable, optionTone, type VariantAxis } from './variant-utils';
import type { VariantDto } from '@/shared/dto/product.dto';

export interface VariantSelectorProps {
  variants: VariantDto[];
  axes: VariantAxis[];
  selected: VariantDto;
  onSelect: (axisKey: string, value: string | number | boolean) => void;
}

/** One axis row: label + option button group. */
function AxisRow({
  variants,
  axes,
  axis,
  selected,
  onSelect,
}: {
  variants: VariantDto[];
  axes: VariantAxis[];
  axis: VariantAxis;
  selected: VariantDto;
  onSelect: (axisKey: string, value: string | number | boolean) => void;
}) {
  const currentValue = selected.attributes?.[axis.key];
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink">
        <LabelHtml html={axis.labelHtml} fallback={axis.label} unit={axis.unit} />:
      </p>
      <div className="flex flex-wrap gap-2.5" role="group" aria-label={axis.label}>
        {axis.values.map((value) => {
          const isSelected = String(currentValue) === String(value);
          const selectable = isOptionSelectable(variants, axes, axis.key, value, selected);
          const tone = optionTone(variants, axes, axis.key, value, selected);
          return (
            <button
              key={String(value)}
              type="button"
              disabled={!selectable}
              aria-pressed={isSelected}
              onClick={() => onSelect(axis.key, value)}
              className={cn(
                'relative inline-flex h-10 min-w-12 items-center justify-center rounded-btn border px-2.5 text-sm font-medium transition-colors',
                isSelected
                  ? 'border-brand bg-brand text-white'
                  : 'border-line bg-white text-ink hover:border-brand hover:text-brand',
                !selectable &&
                  'cursor-not-allowed border-line bg-tile text-muted opacity-60 hover:border-line hover:text-muted',
              )}
            >
              {String(value)}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-white',
                  tone === 'green' && 'bg-stock-green',
                  tone === 'amber' && 'bg-stock-amber',
                  tone === 'red' && 'bg-stock-red',
                )}
              />
              <span className="sr-only">
                {tone === 'green' ? 'In stock' : tone === 'amber' ? 'Available on lead time' : 'Not available'}
                {selectable ? '' : ' — combination not available'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function VariantSelector({ variants, axes, selected, onSelect }: VariantSelectorProps) {
  if (axes.length === 0) return null;
  return (
    <section aria-label="Select variant" className="space-y-4">
      {axes.map((axis) => (
        <AxisRow
          key={axis.key}
          variants={variants}
          axes={axes}
          axis={axis}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </section>
  );
}
