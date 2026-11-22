'use client';

// Variants tab (spec 15.2 "Variants"/"Attributes"/"Pricing"): inline-editable
// grid + a row editor with the dynamic attribute form (category definitions
// drive type-correct inputs) and price tiers. `pricingOnly` renders just the
// tiers table for the Pricing tab.
import { useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { adminApi } from '../admin-api';
import type { CategoryAttributeDto } from '@/shared/dto/catalog.dto';
import type { VariantDto } from '@/shared/dto/product.dto';

interface Draft {
  id: string | null;
  articleNo: string;
  ean: string;
  name: string;
  listPrice: string;
  stockQty: string;
  leadTimeMinDays: string;
  leadTimeMaxDays: string;
  minOrderQty: string;
  packSize: string;
  isActive: boolean;
  sortOrder: string;
  attributes: Record<string, string>;
  tiers: Array<{ minQty: string; price: string }>;
}

function toDraft(variant?: VariantDto): Draft {
  return {
    id: variant?.id ?? null,
    articleNo: variant?.articleNo ?? '',
    ean: variant?.ean ?? '',
    name: variant?.name ?? '',
    listPrice: variant?.listPrice ?? '',
    stockQty: String(variant?.stockQty ?? 0),
    leadTimeMinDays: variant?.leadTimeMinDays === null || variant?.leadTimeMinDays === undefined ? '' : String(variant.leadTimeMinDays),
    leadTimeMaxDays: variant?.leadTimeMaxDays === null || variant?.leadTimeMaxDays === undefined ? '' : String(variant.leadTimeMaxDays),
    minOrderQty: String(variant?.minOrderQty ?? 1),
    packSize: String(variant?.packSize ?? 1),
    isActive: variant?.isActive ?? true,
    sortOrder: '0',
    attributes: Object.fromEntries(
      Object.entries(variant?.attributes ?? {}).map(([key, value]) => [key, value === null ? '' : String(value)]),
    ),
    tiers: (variant?.priceTiers ?? []).map((tier) => ({ minQty: String(tier.minQty), price: tier.price })),
  };
}

function num(value: string): number {
  return value === '' ? 0 : Number(value);
}

function attrInputType(def: CategoryAttributeDto): 'text' | 'number' | 'boolean' | 'select' {
  if (def.type === 'NUMBER') return 'number';
  if (def.type === 'BOOLEAN') return 'boolean';
  if (def.type === 'ENUM' && def.enumValues) return 'select';
  return 'text';
}

function VariantEditor({
  productId,
  defs,
  draft,
  onClose,
  pricingOnly,
}: {
  productId: string;
  defs: CategoryAttributeDto[];
  draft: Draft;
  onClose: () => void;
  pricingOnly?: boolean;
}) {
  const [form, setForm] = useState<Draft>(draft);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (form.articleNo.trim() === '' || form.listPrice.trim() === '') {
      toast({ title: 'Article no. and list price are required', variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      const attributes: Record<string, string | number | boolean | null> = {};
      for (const def of defs) {
        const raw = form.attributes[def.key];
        if (raw === undefined || raw === '') continue;
        if (def.type === 'NUMBER') attributes[def.key] = Number(raw);
        else if (def.type === 'BOOLEAN') attributes[def.key] = raw === 'true';
        else attributes[def.key] = raw;
      }
      const body = {
        articleNo: form.articleNo.trim(),
        ean: form.ean.trim() === '' ? null : form.ean.trim(),
        name: form.name.trim() === '' ? null : form.name.trim(),
        listPrice: form.listPrice.trim(),
        stockQty: num(form.stockQty),
        leadTimeMinDays: form.leadTimeMinDays === '' ? null : num(form.leadTimeMinDays),
        leadTimeMaxDays: form.leadTimeMaxDays === '' ? null : num(form.leadTimeMaxDays),
        minOrderQty: Math.max(1, num(form.minOrderQty)),
        packSize: Math.max(1, num(form.packSize)),
        isActive: form.isActive,
        sortOrder: num(form.sortOrder),
        ...(form.id === null || pricingOnly ? {} : { attributes }),
      };
      if (form.id === null) {
        await adminApi.createVariant(productId, { ...body, attributes });
      } else {
        await adminApi.updateVariant(productId, form.id, body);
        // Tiers replace per variant (PUT price-tiers).
        await adminApi.replacePriceTiers(
          productId,
          form.id,
          form.tiers
            .filter((tier) => tier.minQty !== '' && tier.price !== '')
            .map((tier) => ({ minQty: num(tier.minQty), price: tier.price })),
        );
      }
      toast({ title: form.id === null ? 'Variant created' : 'Variant saved', variant: 'success' });
      onClose();
    } catch (error) {
      toast({ title: 'Could not save the variant', description: error instanceof Error ? error.message : undefined, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-tile border border-brand/50 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold">{form.id === null ? 'New variant' : `Edit ${form.articleNo}`}</p>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cancel edit">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(pricingOnly ? [] : ([
          ['articleNo', 'Article no. *', 'text'],
          ['ean', 'EAN/GTIN', 'text'],
          ['name', 'Variant name', 'text'],
          ['listPrice', 'List price (INR) *', 'text'],
          ['stockQty', 'Stock qty', 'number'],
          ['minOrderQty', 'Min order qty', 'number'],
          ['packSize', 'Pack size', 'number'],
          ['leadTimeMinDays', 'Lead time min (days)', 'number'],
          ['leadTimeMaxDays', 'Lead time max (days)', 'number'],
          ['sortOrder', 'Sort order', 'number'],
        ] as const)).map(([field, label, type]) => (
          <label key={field} className="text-sm">
            <span className="mb-1 block text-muted">{label}</span>
            <Input
              type={type}
              value={form[field]}
              onChange={(event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))}
            />
          </label>
        ))}
        {pricingOnly ? null : (
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              className="h-4 w-4 accent-[var(--brand-orange)]"
            />
            Active
          </label>
        )}
      </div>

      {pricingOnly ? null : (
        <div className="mt-5">
          <p className="text-sm font-bold">Attributes (category definitions)</p>
          {defs.length === 0 ? (
            <p className="mt-1 text-xs text-muted">This category has no attribute mapping yet.</p>
          ) : (
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {defs.map((def) => {
                const kind = attrInputType(def);
                return (
                  <label key={def.key} className="text-sm">
                    <span className="mb-1 block text-muted">
                      {def.label}
                      {def.unit ? ` (${def.unit})` : ''}
                      {def.isRequired ? ' *' : ''}
                    </span>
                    {kind === 'boolean' ? (
                      <Select
                        value={form.attributes[def.key] ?? ''}
                        onValueChange={(value) =>
                          setForm((prev) => ({ ...prev, attributes: { ...prev.attributes, [def.key]: value } }))
                        }
                        options={[
                          { value: '', label: '—' },
                          { value: 'true', label: 'Yes' },
                          { value: 'false', label: 'No' },
                        ]}
                      />
                    ) : kind === 'select' ? (
                      <Select
                        value={form.attributes[def.key] ?? ''}
                        onValueChange={(value) =>
                          setForm((prev) => ({ ...prev, attributes: { ...prev.attributes, [def.key]: value } }))
                        }
                        options={[{ value: '', label: '—' }, ...(def.enumValues ?? []).map((value) => ({ value, label: value }))]}
                      />
                    ) : (
                      <Input
                        type={kind === 'number' ? 'number' : 'text'}
                        value={form.attributes[def.key] ?? ''}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, attributes: { ...prev.attributes, [def.key]: event.target.value } }))
                        }
                      />
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">Quantity price tiers</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setForm((prev) => ({ ...prev, tiers: [...prev.tiers, { minQty: '', price: '' }] }))}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add tier
          </Button>
        </div>
        <div className="mt-2 space-y-2">
          {form.tiers.map((tier, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                type="number"
                value={tier.minQty}
                aria-label="Minimum quantity"
                placeholder="min qty"
                className="w-32"
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    tiers: prev.tiers.map((t, i) => (i === index ? { ...t, minQty: event.target.value } : t)),
                  }))
                }
              />
              <Input
                value={tier.price}
                aria-label="Tier price"
                placeholder="price"
                className="w-40"
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    tiers: prev.tiers.map((t, i) => (i === index ? { ...t, price: event.target.value } : t)),
                  }))
                }
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label="Remove tier"
                onClick={() => setForm((prev) => ({ ...prev, tiers: prev.tiers.filter((_, i) => i !== index) }))}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          {form.tiers.length === 0 ? <p className="text-xs text-muted">No tiers — list price always applies.</p> : null}
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <Button variant="primary" size="sm" disabled={saving} onClick={() => void save()}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Saving…' : 'Save variant'}
        </Button>
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function VariantsTab({
  productId,
  variants,
  defs,
  pricingOnly,
}: {
  productId: string;
  variants: VariantDto[];
  defs: CategoryAttributeDto[];
  pricingOnly?: boolean;
}) {
  const [editing, setEditing] = useState<Draft | null>(null);

  const remove = async (variant: VariantDto) => {
    try {
      await adminApi.deleteVariant(productId, variant.id);
      toast({ title: `Variant ${variant.articleNo} removed`, variant: 'success' });
    } catch (error) {
      toast({ title: 'Could not remove', description: error instanceof Error ? error.message : undefined, variant: 'error' });
    }
  };

  return (
    <div>
      {pricingOnly ? null : (
        <div className="mb-3">
          <Button variant="outline" size="sm" onClick={() => setEditing(toDraft())}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add variant
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-tile border border-line">
        <table className="w-full text-sm">
          <thead className="bg-tile text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5 font-bold">Article no.</th>
              {pricingOnly ? null : <th className="px-4 py-2.5 font-bold">Attributes</th>}
              <th className="px-4 py-2.5 font-bold">List price</th>
              <th className="px-4 py-2.5 font-bold">Tiers</th>
              <th className="px-4 py-2.5 font-bold">Stock</th>
              {pricingOnly ? null : <th className="px-4 py-2.5 font-bold">Lead time</th>}
              <th className="px-4 py-2.5 font-bold">Rules</th>
              <th className="px-4 py-2.5 font-bold">Active</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {variants.map((variant) => (
              <tr key={variant.id}>
                <td className="px-4 py-2.5 font-medium">{variant.articleNo}</td>
                {pricingOnly ? null : (
                  <td className="max-w-56 truncate px-4 py-2.5 text-xs text-muted">
                    {Object.entries(variant.attributes)
                      .map(([key, value]) => `${key}: ${String(value)}`)
                      .join(' · ') || '—'}
                  </td>
                )}
                <td className="px-4 py-2.5">INR {variant.listPrice}</td>
                <td className="px-4 py-2.5 text-xs">
                  {variant.priceTiers.length === 0
                    ? '—'
                    : variant.priceTiers.map((tier) => `${tier.minQty}+ @ ${tier.price}`).join(', ')}
                </td>
                <td className="px-4 py-2.5">{variant.stockQty}</td>
                {pricingOnly ? null : (
                  <td className="px-4 py-2.5 text-xs">
                    {variant.leadTimeMinDays === null
                      ? '—'
                      : `${variant.leadTimeMinDays}–${variant.leadTimeMaxDays ?? variant.leadTimeMinDays} d`}
                  </td>
                )}
                <td className="px-4 py-2.5 text-xs">
                  min {variant.minOrderQty} · pack {variant.packSize}
                </td>
                <td className="px-4 py-2.5">{variant.isActive ? 'Yes' : 'No'}</td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    type="button"
                    className="text-xs font-bold text-brand underline underline-offset-2"
                    onClick={() => setEditing(toDraft(variant))}
                  >
                    {pricingOnly ? 'Edit tiers' : 'Edit'}
                  </button>
                  {pricingOnly ? null : (
                    <button
                      type="button"
                      className="ms-3 text-xs font-bold text-stock-red underline underline-offset-2"
                      onClick={() => void remove(variant)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {variants.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted">
                  No variants yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {editing ? (
        <div className="mt-4">
          <VariantEditor productId={productId} defs={defs} draft={editing} pricingOnly={pricingOnly} onClose={() => setEditing(null)} />
        </div>
      ) : null}
    </div>
  );
}
