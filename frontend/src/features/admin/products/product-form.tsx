'use client';

// Product form (spec 15.2): tabbed create/edit — General, Variants (with the
// dynamic attribute editor), Images, Documents, Pricing tiers, SEO. Saving
// patches the product; variants/images/documents/tiers save through their own
// endpoints on each tab action. Create mode first persists the product (so
// the id exists), then redirects to the edit route.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { Button, Input, Select, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { apiFetch } from '@/lib/api-client';
import { authFetch } from '@/features/auth/with-auth-fetch';
import { adminApi } from '../admin-api';
import { AdminPageHeader } from '../admin-shell';
import { VariantsTab } from './variants-tab';
import { MediaTab } from './media-tab';
import type { BrandDto, CategoryAttributeDto, NavigationNodeDto } from '@/shared/dto/catalog.dto';
import type { VariantDto } from '@/shared/dto/product.dto';

export interface AdminProductDetail {
  id: string;
  slug: string;
  name: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  isBestseller: boolean;
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryName: string;
  shortDescription: string | null;
  descriptionHtml: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  variants: VariantDto[];
  images: Array<{ id: string; url: string; alt: string | null; kind: string; variantId: string | null; sortOrder: number }>;
  documents: Array<{ id: string; kind: string; title: string; url: string; sizeBytes: number | null }>;
}

type ProductStatus = AdminProductDetail['status'];

/** Flattens the navigation tree into level-indented select options (code
 * included — attribute mappings are addressed by category code). */
export function flattenTree(
  nodes: NavigationNodeDto[],
  depth = 0,
  out: Array<{ id: string; code: string; label: string; level: number; hasChildren: boolean }> = [],
) {
  for (const node of nodes) {
    out.push({ id: node.id, code: node.code, label: node.name, level: depth, hasChildren: node.children.length > 0 });
    flattenTree(node.children, depth + 1, out);
  }
  return out;
}

async function loadProduct(id: string): Promise<AdminProductDetail> {
  const { data } = await authFetch<AdminProductDetail>(`/admin/products/${id}`);
  return data;
}

/**
 * Container: loads the reference data (brands, category tree, the product in
 * edit mode, the category's attribute definitions) and renders the form.
 */
export function ProductForm({ mode, productId }: { mode: 'create' | 'edit'; productId?: string }) {
  const brandsQuery = useQuery({
    queryKey: ['admin', 'refs', 'brands'],
    queryFn: async (): Promise<BrandDto[]> => (await apiFetch<BrandDto[]>('/brands', { query: { pageSize: 100 } })).data,
  });
  const treeQuery = useQuery({
    queryKey: ['admin', 'refs', 'tree'],
    queryFn: async (): Promise<NavigationNodeDto[]> =>
      (await apiFetch<NavigationNodeDto[]>('/navigation/tree', { query: { depth: 5 } })).data,
  });
  const productQuery = useQuery({
    queryKey: ['admin', 'product', productId],
    queryFn: () => loadProduct(productId!),
    enabled: mode === 'edit' && productId !== undefined,
  });

  const product = productQuery.data;
  const categoryOptions = useMemo(() => flattenTree(treeQuery.data ?? []), [treeQuery.data]);
  const defsQuery = useQuery({
    queryKey: ['admin', 'product', 'defs', product?.categoryId ?? '', treeQuery.dataUpdatedAt],
    enabled: product !== undefined,
    queryFn: async (): Promise<CategoryAttributeDto[]> => {
      const categoryId = product?.categoryId ?? '';
      if (categoryId === '') return [];
      const node = flattenTree(treeQuery.data ?? []).find((option) => option.id === categoryId);
      if (!node) return [];
      const { data } = await apiFetch<CategoryAttributeDto[]>(`/categories/${encodeURIComponent(node.code)}/filters`);
      return data;
    },
  });

  if (mode === 'edit' && productQuery.isError) {
    return (
      <p className="mb-4 flex items-center gap-2 rounded-tile border border-stock-red/50 bg-stock-red/10 p-3 text-sm">
        <AlertCircle className="h-4 w-4 text-stock-red" aria-hidden="true" />
        Could not load the product: {(productQuery.error as Error).message}
      </p>
    );
  }

  return (
    <div>
      <ProductFields
        key={product?.id ?? 'new'}
        mode={mode}
        initial={product ?? null}
        brands={brandsQuery.data ?? []}
        categoryOptions={categoryOptions}
        attributeDefs={defsQuery.data ?? []}
      />
    </div>
  );
}

/**
 * The form itself. In edit mode `initial` carries the saved product; in create
 * mode the General tab creates it on first save and redirects to /admin/:id.
 * Variants/Images/Documents/Pricing tabs unlock once the product exists.
 */
function ProductFields({
  mode,
  initial,
  brands,
  categoryOptions,
  attributeDefs,
}: {
  mode: 'create' | 'edit';
  initial: AdminProductDetail | null;
  brands: BrandDto[];
  categoryOptions: ReturnType<typeof flattenTree>;
  attributeDefs: CategoryAttributeDto[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    slug: initial?.slug ?? '',
    brandId: initial?.brandId ?? '',
    categoryId: initial?.categoryId ?? '',
    status: (initial?.status ?? 'DRAFT') as ProductStatus,
    isBestseller: initial?.isBestseller ?? false,
    shortDescription: initial?.shortDescription ?? '',
    descriptionHtml: initial?.descriptionHtml ?? '',
    seoTitle: initial?.seoTitle ?? '',
    seoDescription: initial?.seoDescription ?? '',
  });
  const [savedId, setSavedId] = useState<string | null>(initial?.id ?? null);
  const [savedSlug, setSavedSlug] = useState<string | null>(initial?.slug ?? null);
  const [saving, setSaving] = useState(false);
  const editable = savedId !== null;

  const saveGeneral = async () => {
    if (form.name.trim() === '' || form.brandId === '' || form.categoryId === '') {
      toast({ title: 'Name, brand and category are required', variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        brandId: form.brandId,
        categoryId: form.categoryId,
        status: form.status,
        isBestseller: form.isBestseller,
        shortDescription: form.shortDescription || null,
        descriptionHtml: form.descriptionHtml || null,
        seoTitle: form.seoTitle || null,
        seoDescription: form.seoDescription || null,
      };
      if (savedId === null) {
        const created = await adminApi.createProduct(body);
        setSavedId(created.data.id);
        setSavedSlug(created.data.slug);
        toast({ title: 'Product created — continue with variants', variant: 'success' });
        void queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
        router.replace(`/admin/products/${created.data.id}`);
      } else {
        const updated = await adminApi.updateProduct(savedId, body);
        setSavedSlug(updated.data.slug);
        toast({ title: 'Product saved', variant: 'success' });
      }
      void queryClient.invalidateQueries({ queryKey: ['admin', 'product', savedId] });
    } catch (error) {
      toast({ title: 'Could not save', description: error instanceof Error ? error.message : undefined, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <AdminPageHeader title={mode === 'create' ? 'New product' : (initial?.name ?? 'Edit product')}>
        <Button variant="primary" size="sm" disabled={saving} onClick={() => void saveGeneral()}>
          {saving ? 'Saving…' : 'Save product'}
        </Button>
      </AdminPageHeader>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="variants">Variants &amp; attributes</TabsTrigger>
          <TabsTrigger value="images">Images</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-muted">Name *</span>
            <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} maxLength={200} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Slug (auto when empty)</span>
            <Input value={form.slug} onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))} maxLength={160} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Status</span>
            <Select
              value={form.status}
              onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as ProductStatus }))}
              options={[
                { value: 'DRAFT', label: 'Draft' },
                { value: 'PUBLISHED', label: 'Published' },
                { value: 'ARCHIVED', label: 'Archived' },
              ]}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Brand *</span>
            <Select
              value={form.brandId}
              onValueChange={(value) => setForm((prev) => ({ ...prev, brandId: value }))}
              options={[{ value: '', label: 'Select…' }, ...brands.map((brand) => ({ value: brand.id, label: brand.name }))]}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Category (leaf) *</span>
            <Select
              value={form.categoryId}
              onValueChange={(value) => setForm((prev) => ({ ...prev, categoryId: value }))}
              options={[
                { value: '', label: 'Select…' },
                ...categoryOptions.map((option) => ({
                  value: option.id,
                  label: `${'\u00a0\u00a0'.repeat(option.level)}${option.label}`,
                })),
              ]}
            />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.isBestseller}
              onChange={(event) => setForm((prev) => ({ ...prev, isBestseller: event.target.checked }))}
              className="h-4 w-4 accent-[var(--brand-orange)]"
            />
            Bestseller badge
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-muted">Short description</span>
            <Textarea
              rows={2}
              maxLength={500}
              value={form.shortDescription}
              onChange={(event) => setForm((prev) => ({ ...prev, shortDescription: event.target.value }))}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-muted">Description (sanitised HTML)</span>
            <Textarea
              rows={6}
              value={form.descriptionHtml}
              onChange={(event) => setForm((prev) => ({ ...prev, descriptionHtml: event.target.value }))}
            />
          </label>
        </TabsContent>

        <TabsContent value="variants" className="mt-6">
          {editable ? (
            <VariantsTab productId={savedId!} variants={initial?.variants ?? []} defs={attributeDefs} />
          ) : (
            <p className="rounded-tile border border-line bg-tile p-4 text-sm text-muted">
              Save the product first — variants hang off the product record.
            </p>
          )}
        </TabsContent>

        <TabsContent value="images" className="mt-6">
          {editable ? (
            <MediaTab productId={savedId!} kind="images" items={initial?.images ?? []} variants={initial?.variants ?? []} />
          ) : (
            <p className="rounded-tile border border-line bg-tile p-4 text-sm text-muted">Save the product first.</p>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          {editable ? (
            <MediaTab productId={savedId!} kind="documents" items={initial?.documents ?? []} variants={initial?.variants ?? []} />
          ) : (
            <p className="rounded-tile border border-line bg-tile p-4 text-sm text-muted">Save the product first.</p>
          )}
        </TabsContent>

        <TabsContent value="pricing" className="mt-6">
          {editable ? (
            <VariantsTab productId={savedId!} variants={initial?.variants ?? []} defs={attributeDefs} pricingOnly />
          ) : (
            <p className="rounded-tile border border-line bg-tile p-4 text-sm text-muted">Save the product first.</p>
          )}
        </TabsContent>

        <TabsContent value="seo" className="mt-6 grid gap-4">
          <label className="text-sm">
            <span className="mb-1 block text-muted">SEO title</span>
            <Input value={form.seoTitle} onChange={(event) => setForm((prev) => ({ ...prev, seoTitle: event.target.value }))} maxLength={300} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Meta description (150–160 chars recommended)</span>
            <Textarea
              rows={3}
              maxLength={500}
              value={form.seoDescription}
              onChange={(event) => setForm((prev) => ({ ...prev, seoDescription: event.target.value }))}
            />
          </label>
          <p className="text-xs text-muted">
            {savedSlug ? `URL: /p/${savedSlug}` : 'URL slug appears after saving.'} · remember to hit “Save product”.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
