'use client';

// Brands management (spec 15.4): compact CRUD table with an inline editor.
// Reference protection (brands with products) is enforced server-side.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save } from 'lucide-react';
import { Button, Input, Textarea } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { apiFetch } from '@/lib/api-client';
import { adminApi } from './admin-api';
import { AdminPageHeader } from './admin-shell';
import type { BrandDto } from '@/shared/dto/catalog.dto';

function BrandsPanel() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: ['admin', 'brands-all'],
    queryFn: async (): Promise<Array<BrandDto & { productCount?: number }>> =>
      (await apiFetch<Array<BrandDto & { productCount?: number }>>('/brands', { query: { pageSize: 100 } })).data,
  });
  const [editing, setEditing] = useState<{ id: string | null; name: string; slug: string; description: string; isPremium: boolean } | null>(null);

  const save = async () => {
    if (editing === null || editing.name.trim() === '') return;
    try {
      const body = { name: editing.name.trim(), slug: editing.slug.trim() || undefined, description: editing.description || null, isPremium: editing.isPremium };
      if (editing.id === null) await adminApi.createBrand(body);
      else await adminApi.updateBrand(editing.id, body);
      toast({ title: 'Brand saved', variant: 'success' });
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'brands-all'] });
    } catch (error) {
      toast({ title: 'Could not save', description: error instanceof Error ? error.message : undefined, variant: 'error' });
    }
  };

  return (
    <section aria-labelledby="brands-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="brands-heading" className="text-sm font-bold uppercase tracking-wide text-muted">Brands</h2>
        <Button variant="outline" size="sm" onClick={() => setEditing({ id: null, name: '', slug: '', description: '', isPremium: false })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New brand
        </Button>
      </div>
      <ul className="divide-y divide-line rounded-tile border border-line text-sm">
        {(listQuery.data ?? []).map((brand) => (
          <li key={brand.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{brand.name}</span>
              <span className="ms-2 text-xs text-muted">{brand.slug}{brand.productCount !== undefined ? ` · ${brand.productCount} products` : ''}</span>
            </span>
            <button type="button" className="text-xs font-bold text-brand underline underline-offset-2" onClick={() => setEditing({ id: brand.id, name: brand.name, slug: brand.slug, description: brand.description ?? '', isPremium: brand.isPremium })}>
              Edit
            </button>
            <button
              type="button"
              className="text-xs font-bold text-stock-red underline underline-offset-2"
              onClick={async () => {
                try {
                  await adminApi.deleteBrand(brand.id);
                  toast({ title: 'Brand deleted', variant: 'success' });
                  void queryClient.invalidateQueries({ queryKey: ['admin', 'brands-all'] });
                } catch (error) {
                  toast({ title: 'Could not delete (brand in use?)', description: error instanceof Error ? error.message : undefined, variant: 'error' });
                }
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {editing ? (
        <div className="mt-3 grid gap-3 rounded-tile border border-brand/50 p-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Name *</span>
            <Input value={editing.name} onChange={(event) => setEditing((prev) => prev && { ...prev, name: event.target.value })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Slug (auto when empty)</span>
            <Input value={editing.slug} onChange={(event) => setEditing((prev) => prev && { ...prev, slug: event.target.value })} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-muted">Description</span>
            <Textarea rows={2} value={editing.description} onChange={(event) => setEditing((prev) => prev && { ...prev, description: event.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[var(--brand-orange)]" checked={editing.isPremium} onChange={(event) => setEditing((prev) => prev && { ...prev, isPremium: event.target.checked })} />
            Premium
          </label>
          <div className="sm:col-span-2">
            <Button variant="primary" size="sm" onClick={() => void save()}>
              <Save className="h-4 w-4" aria-hidden="true" />
              Save
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function BrandsView() {
  return (
    <div>
      <AdminPageHeader title="Brands" />
      <BrandsPanel />
    </div>
  );
}
