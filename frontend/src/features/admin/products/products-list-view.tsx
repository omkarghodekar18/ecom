'use client';

// Admin products list (spec 15.2): search + filters (brand, status, low stock),
// server-side pagination, row selection with a bulk-action bar (publish,
// unpublish, archive, delete — confirmation before destructive actions) and a
// per-row duplicate action. Bulk mutations invalidate the react-query cache so
// the table reflects the server state immediately.
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Search } from 'lucide-react';
import { Badge, Button, Checkbox, Input, Modal, Select, Skeleton } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { adminApi } from '../admin-api';
import { AdminPageHeader } from '../admin-shell';
import { formatInr } from '@/lib/format';
import { apiFetch } from '@/lib/api-client';
import type { BrandDto } from '@/shared/dto/catalog.dto';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ARCHIVED', label: 'Archived' },
];

type BulkAction = 'PUBLISH' | 'UNPUBLISH' | 'ARCHIVE' | 'DELETE';

const BULK_LABELS: Record<BulkAction, string> = {
  PUBLISH: 'Publish',
  UNPUBLISH: 'Unpublish',
  ARCHIVE: 'Archive',
  DELETE: 'Delete',
};

export function ProductsListView() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [stock, setStock] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<BulkAction | null>(null);
  const [busy, setBusy] = useState(false);

  const brandsQuery = useQuery({
    queryKey: ['admin', 'brands-all'],
    queryFn: async (): Promise<BrandDto[]> => (await apiFetch<BrandDto[]>('/brands', { query: { pageSize: 100 } })).data,
  });
  const [brandId, setBrandId] = useState('');
  const productsQuery = useQuery({
    queryKey: ['admin', 'products', { q, status, stock, brandId, page }],
    queryFn: () =>
      adminApi.listProducts({ q: q || undefined, status: status || undefined, stock: stock === 'low' ? 'low' : undefined, brandId: brandId || undefined, page, pageSize: 20 }),
  });

  const meta = productsQuery.data?.meta;
  const items = productsQuery.data?.data ?? [];
  const allVisibleSelected = items.length > 0 && items.every((product) => selected.has(product.id));

  const toggleRow = (id: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = (): void => {
    setSelected(allVisibleSelected ? new Set() : new Set(items.map((product) => product.id)));
  };

  const runBulk = async (action: BulkAction): Promise<void> => {
    setBusy(true);
    try {
      const result = await adminApi.bulkUpdateProducts({ ids: [...selected], action });
      toast({ variant: 'success', title: `${BULK_LABELS[action]} applied`, description: `${result.data.updated} product(s) updated.` });
      setSelected(new Set());
      setConfirmAction(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
    } catch (error) {
      toast({ variant: 'error', title: 'Bulk action failed', description: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (id: string): Promise<void> => {
    try {
      const result = await adminApi.duplicateProduct(id);
      toast({ variant: 'success', title: 'Product duplicated', description: `${result.data.name} created as a draft.` });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
    } catch (error) {
      toast({ variant: 'error', title: 'Duplicate failed', description: (error as Error).message });
    }
  };

  return (
    <div>
      <AdminPageHeader title="Products">
        <Button href="/admin/products/new" variant="primary" size="sm">
          <Plus className="h-4 w-4" aria-hidden="true" />
          New product
        </Button>
      </AdminPageHeader>

      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          void productsQuery.refetch();
        }}
      >
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="Search name, article no., EAN…"
            aria-label="Search products"
            className="ps-9"
          />
        </div>
        <Select
          options={[{ value: '', label: 'All brands' }, ...(brandsQuery.data ?? []).map((brand) => ({ value: brand.id, label: brand.name }))]}
          value={brandId}
          onValueChange={(value) => {
            setBrandId(value);
            setPage(1);
          }}
          aria-label="Filter by brand"
          className="w-44"
        />
        <Select
          options={STATUS_OPTIONS}
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="w-40"
        />
        <Select
          options={[
            { value: '', label: 'Any stock' },
            { value: 'low', label: 'Low stock' },
          ]}
          value={stock}
          onValueChange={(value) => {
            setStock(value);
            setPage(1);
          }}
          aria-label="Filter by stock"
          className="w-36"
        />
      </form>

      {selected.size > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-btn border border-brand/40 bg-brand/5 px-3 py-2 text-sm">
          <span className="font-bold text-ink">{selected.size} selected</span>
          <span className="text-muted">·</span>
          {(Object.keys(BULK_LABELS) as BulkAction[]).map((action) => (
            <Button
              key={action}
              type="button"
              size="sm"
              variant={action === 'DELETE' ? 'navy' : 'outline'}
              disabled={busy}
              onClick={() => setConfirmAction(action)}
            >
              {BULK_LABELS[action]}
            </Button>
          ))}
          <button
            type="button"
            className="ms-auto text-xs font-bold text-muted underline underline-offset-2"
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </button>
        </div>
      ) : null}

      {productsQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      ) : productsQuery.isError ? (
        <p className="rounded-tile border border-stock-red/50 bg-stock-red/10 p-4 text-sm">
          Could not load products: {(productsQuery.error as Error).message}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-tile border border-line">
            <table className="w-full text-sm">
              <thead className="bg-tile text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="w-10 px-4 py-2.5">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all products on this page"
                    />
                  </th>
                  <th className="px-4 py-2.5 font-bold">Name</th>
                  <th className="px-4 py-2.5 font-bold">Brand</th>
                  <th className="px-4 py-2.5 font-bold">Category</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 font-bold">Variants</th>
                  <th className="px-4 py-2.5 font-bold">Price from</th>
                  <th className="px-4 py-2.5 font-bold">Updated</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((product) => (
                  <tr key={product.id} className="hover:bg-tile/60">
                    <td className="px-4 py-2.5">
                      <Checkbox
                        checked={selected.has(product.id)}
                        onCheckedChange={() => toggleRow(product.id)}
                        aria-label={`Select ${product.name}`}
                      />
                    </td>
                    <td className="px-4 py-2.5 font-medium text-ink">{product.name}</td>
                    <td className="px-4 py-2.5">{product.brandName}</td>
                    <td className="px-4 py-2.5">{product.categoryName}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={product.status === 'PUBLISHED' ? 'brand' : 'neutral'}>{product.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5">{product.variantCount}</td>
                    <td className="px-4 py-2.5">{product.minPrice === null ? '—' : formatInr(product.minPrice)}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">{new Date(product.updatedAt).toLocaleDateString('en-IN')}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <button
                        type="button"
                        className="me-3 text-xs font-bold text-ink underline underline-offset-2 hover:text-brand"
                        onClick={() => void duplicate(product.id)}
                      >
                        <Copy className="me-1 inline h-3 w-3" aria-hidden="true" />
                        Duplicate
                      </button>
                      <Link href={`/admin/products/${product.id}`} className="text-xs font-bold text-brand underline underline-offset-2">
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted">
                      No products match the filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                Previous
              </Button>
              <span className="text-muted">
                Page {meta.page} of {meta.totalPages} · {meta.total} products
              </span>
              <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((current) => current + 1)}>
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}

      <Modal
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={confirmAction === null ? '' : `${BULK_LABELS[confirmAction]} ${selected.size} product(s)?`}
      >
        <p className="text-sm text-muted">
          {confirmAction === 'DELETE'
            ? 'The products will be soft-deleted (restorable from the audit log or the API). Variants are archived with them.'
            : 'This bulk change is audited and can be reverted per product from the edit form.'}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)}>
            Cancel
          </Button>
          <Button
            variant={confirmAction === 'DELETE' ? 'navy' : 'primary'}
            size="sm"
            disabled={busy}
            onClick={() => confirmAction !== null && void runBulk(confirmAction)}
          >
            {busy ? 'Working…' : confirmAction === null ? '' : BULK_LABELS[confirmAction]}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
