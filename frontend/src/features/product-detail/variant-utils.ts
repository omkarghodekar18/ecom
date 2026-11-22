// Pure variant-selection logic for the PDP: axis derivation from the
// category's attribute definitions, the variant existence matrix (which
// axis-value combinations exist), per-option availability dots, technical-data
// rows for the selected variant and variant-scoped image lists. No React —
// fully unit-testable.
import type { CategoryAttributeDto } from '@/shared/dto/catalog.dto';
import type { AvailabilityTone } from '@/lib/format';
import type { ImageDto, ProductDetailDto, TechDataDto, VariantAttributes, VariantDto } from '@/shared/dto/product.dto';

/** Attribute values are string | number | boolean | null on the wire. */
export type AttrValue = string | number | boolean;

export interface VariantAxis {
  key: string;
  label: string;
  labelHtml: string | null;
  unit: string | null;
  /** Ordered option values seen across the product's variants. */
  values: AttrValue[];
}

/** Stable option ordering: numeric when every value parses, else lexicographic. */
function orderValues(values: AttrValue[]): AttrValue[] {
  const unique = Array.from(
    values.reduce((seen, v) => {
      seen.set(String(v), v);
      return seen;
    }, new Map<string, AttrValue>()),
  ).map(([, v]) => v);
  const numeric = unique.every((v) => v !== '' && Number.isFinite(Number(v)));
  return numeric
    ? unique.sort((a, b) => Number(a) - Number(b))
    : unique.sort((a, b) => String(a).localeCompare(String(b), 'en', { numeric: true }));
}

/** Axes of a product: category defs flagged isVariantAxis that variants use. */
export function variantAxes(
  defs: CategoryAttributeDto[],
  variants: VariantDto[],
): VariantAxis[] {
  const usedKeys = new Set(variants.flatMap((v) => Object.keys(v.attributes ?? {})));
  return defs
    .filter((d) => d.isVariantAxis && usedKeys.has(d.key))
    .map((d) => ({
      key: d.key,
      label: d.label,
      labelHtml: d.labelHtml,
      unit: d.unit,
      values: orderValues(
        variants.flatMap((v) => (v.attributes?.[d.key] === undefined || v.attributes[d.key] === null ? [] : [v.attributes[d.key] as AttrValue])),
      ),
    }));
}

/** Variant attributes as a plain string-keyed map of display values. */
export function axisSelection(variant: VariantDto): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(variant.attributes ?? {})) {
    if (v !== null) out[k] = String(v);
  }
  return out;
}

/** Variants matching a partial axis selection ({axisKey: valueString}). */
export function variantsMatching(variants: VariantDto[], selection: Record<string, string>): VariantDto[] {
  return variants.filter((v) => {
    const attrs = axisSelection(v);
    return Object.entries(selection).every(([k, val]) => attrs[k] === val);
  });
}

/** Selection of every axis EXCEPT `axisKey`, taken from the current variant. */
function selectionOnOtherAxes(axes: VariantAxis[], axisKey: string, current: VariantDto): Record<string, string> {
  const attrs = axisSelection(current);
  const selection: Record<string, string> = {};
  for (const axis of axes) {
    if (axis.key === axisKey) continue;
    const value = attrs[axis.key];
    if (value !== undefined) selection[axis.key] = value;
  }
  return selection;
}

/** True when an option is selectable: a variant exists with this value on `axisKey` while all OTHER axes keep their current selection. */
export function isOptionSelectable(
  variants: VariantDto[],
  axes: VariantAxis[],
  axisKey: string,
  value: AttrValue,
  current: VariantDto,
): boolean {
  const others = selectionOnOtherAxes(axes, axisKey, current);
  return variantsMatching(variants, { ...others, [axisKey]: String(value) }).length > 0;
}

/**
 * Availability tone for one option: best tone across its variants. The pool
 * respects the other axes' current selection when the combination exists
 * (single-axis products degenerate to "any variant having that axis value").
 */
export function optionTone(
  variants: VariantDto[],
  axes: VariantAxis[],
  axisKey: string,
  value: AttrValue,
  current: VariantDto,
): AvailabilityTone {
  const others = selectionOnOtherAxes(axes, axisKey, current);
  const pool = variantsMatching(variants, { ...others, [axisKey]: String(value) });
  const candidates = pool.length > 0 ? pool : variants.filter((v) => String(v.attributes?.[axisKey] ?? '') === String(value));
  if (candidates.some((v) => v.stockQty > 0)) return 'green';
  if (candidates.some((v) => (v.leadTimeMinDays ?? 0) > 0)) return 'amber';
  return 'red';
}

/** Picks the variant for a new axis value: keep the other axes, else first with the value. */
export function selectVariant(
  variants: VariantDto[],
  axes: VariantAxis[],
  axisKey: string,
  value: AttrValue,
  current: VariantDto,
): VariantDto {
  const others = selectionOnOtherAxes(axes, axisKey, current);
  const exact = variantsMatching(variants, { ...others, [axisKey]: String(value) })[0];
  if (exact) return exact;
  const any = variantsMatching(variants, { [axisKey]: String(value) })[0];
  return any ?? current;
}

/** "Centre drill HSS-E A TiAlN 1 mm" — product name + axis values with units. */
export function variantDisplayName(product: ProductDetailDto, variant: VariantDto, axes: VariantAxis[]): string {
  const attrs = axisSelection(variant);
  const suffix = axes
    .filter((a) => attrs[a.key] !== undefined)
    .map((a) => (a.unit ? `${attrs[a.key]} ${a.unit}` : attrs[a.key]))
    .join(' ');
  return suffix ? `${product.name} ${suffix}` : product.name;
}

/** Technical-data rows for a variant: attribute defs joined with the variant's values, in def order. */
export function techRowsFor(defs: CategoryAttributeDto[], attributes: VariantAttributes): TechDataDto[] {
  const rows: TechDataDto[] = [];
  for (const def of defs) {
    const value = attributes?.[def.key];
    if (value === undefined || value === null || value === '') continue;
    rows.push({
      key: def.key,
      label: def.label,
      labelHtml: def.labelHtml,
      groupName: def.groupName,
      unit: def.unit,
      type: def.type,
      value,
    });
  }
  return rows;
}

/** Images for a variant: variant-specific first, then shared, by sortOrder. */
export function imagesForVariant(images: ImageDto[], variantId: string): ImageDto[] {
  return images
    .filter((img) => img.variantId === null || img.variantId === variantId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
