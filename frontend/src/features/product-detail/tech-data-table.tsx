'use client';

// "Technical Data" zebra table (spec 6.4 Product details tab): two columns —
// attribute label (with subscript formatting) and value + unit — driven by the
// category's attribute definitions joined with the SELECTED variant's values.
import { LabelHtml } from './label-html';
import { techRowsFor } from './variant-utils';
import { cn } from '@/lib/cn';
import type { CategoryAttributeDto } from '@/shared/dto/catalog.dto';
import type { VariantAttributes } from '@/shared/dto/product.dto';

export interface TechDataTableProps {
  defs: CategoryAttributeDto[];
  attributes: VariantAttributes;
  /** Extra label for screen readers, e.g. the variant's article number. */
  caption?: string;
}

/** Formats one attribute value (booleans as Yes/No, null as —, numbers trimmed). */
export function formatTechValue(value: string | number | boolean | null): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export function TechDataTable({ defs, attributes, caption }: TechDataTableProps) {
  const rows = techRowsFor(defs, attributes);
  if (rows.length === 0) {
    return <p className="text-sm text-muted">No technical data recorded for this variant.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full max-w-2xl border border-line text-sm">
        <caption className="sr-only">{caption ?? 'Technical data'}</caption>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.key} className={cn(i % 2 === 0 ? 'bg-tile' : 'bg-white')}>
              <th scope="row" className="w-1/2 border-r border-line px-3 py-2 text-left font-medium text-ink">
                <LabelHtml html={row.labelHtml} fallback={row.label} />
              </th>
              <td className="px-3 py-2 text-ink">
                {formatTechValue(row.value)}
                {row.unit ? ` ${row.unit}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
