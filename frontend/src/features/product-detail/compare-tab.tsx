'use client';

// "Compare products" tab (spec 6.4): up to 4 products kept client-side in
// localStorage ("th:compare"); a side-by-side table of technical attributes.
// "Add to comparison" starts with the product currently on screen.
import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { Badge, Button, EmptyState, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui';
import { routes } from '@/config/routes';
import { useCompareStore, MAX_COMPARE, type CompareEntry } from './compare-store';
import { LabelHtml } from './label-html';
import { formatTechValue } from './tech-data-table';
import { techRowsFor } from './variant-utils';
import type { CategoryAttributeDto } from '@/shared/dto/catalog.dto';
import type { ProductDetailDto, TechDataDto, VariantDto } from '@/shared/dto/product.dto';

function buildCompareEntry(
  product: ProductDetailDto,
  variant: VariantDto,
  defs: CategoryAttributeDto[],
): CompareEntry {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    brandName: product.brand.name,
    firstArticleNo: variant.articleNo,
    image: product.images[0]?.url ?? null,
    imageAlt: product.images[0]?.alt ?? null,
    techData: techRowsFor(defs, variant.attributes),
  };
}

/** Union of attribute rows across entries, keeping first-seen order. */
function mergedRows(entries: CompareEntry[]): TechDataDto[] {
  const byKey = new Map<string, TechDataDto>();
  for (const entry of entries) {
    for (const row of entry.techData) {
      if (!byKey.has(row.key)) byKey.set(row.key, row);
    }
  }
  return Array.from(byKey.values());
}

export interface CompareTabProps {
  product: ProductDetailDto;
  variant: VariantDto;
  defs: CategoryAttributeDto[];
  locale: string;
}

export function CompareTab({ product, variant, defs, locale }: CompareTabProps) {
  const { entries, hydrated, hydrate, add, remove, clear } = useCompareStore();
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const r = routes(locale);
  const inCompare = entries.some((e) => e.id === product.id);
  const full = entries.length >= MAX_COMPARE && !inCompare;
  const rows = useMemo(() => mergedRows(entries), [entries]);

  return (
    <div className="space-y-4">
      {full ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block cursor-not-allowed" tabIndex={0}>
              <Button variant="outline" disabled>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add to comparison
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>You can compare up to {MAX_COMPARE} products</TooltipContent>
        </Tooltip>
      ) : inCompare ? (
        <Button variant="outline" disabled>
          <Plus className="h-4 w-4" aria-hidden="true" />
          In comparison
        </Button>
      ) : (
        <Button variant="outline" onClick={() => add(buildCompareEntry(product, variant, defs))}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add to comparison
        </Button>
      )}

      {!hydrated || entries.length === 0 ? (
        <EmptyState
          title="Add products to compare them side by side."
          description={`Open another product page and add it here — up to ${MAX_COMPARE} products.`}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border border-line text-sm">
              <caption className="sr-only">Product comparison</caption>
              <thead>
                <tr className="border-b border-line bg-tile text-left">
                  <th scope="col" className="w-44 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
                    Attribute
                  </th>
                  {entries.map((entry) => (
                    <th key={entry.id} scope="col" className="px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Badge variant="brand">{entry.brandName}</Badge>
                          <Link
                            href={r.product(entry.slug, entry.firstArticleNo)}
                            className="mt-1 block text-sm font-bold text-ink transition-colors hover:text-brand"
                          >
                            {entry.name}
                          </Link>
                          <span className="text-xs font-normal text-muted">Article no.: {entry.firstArticleNo}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(entry.id)}
                          aria-label={`Remove ${entry.name} from comparison`}
                          className="rounded-btn p-1 text-muted transition-colors hover:bg-white hover:text-stock-red"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.key} className={i % 2 === 0 ? 'bg-white' : 'bg-tile/60'}>
                    <th scope="row" className="border-t border-line px-3 py-2 text-left font-medium text-ink">
                      <LabelHtml html={row.labelHtml} fallback={row.label} />
                    </th>
                    {entries.map((entry) => {
                      const cell = entry.techData.find((e) => e.key === row.key);
                      return (
                        <td key={entry.id} className="border-t border-line px-3 py-2 text-ink">
                          {cell
                            ? `${formatTechValue(cell.value)}${cell.unit ? ` ${cell.unit}` : ''}`
                            : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="ghost" size="sm" onClick={clear}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Clear comparison
          </Button>
        </>
      )}
    </div>
  );
}
