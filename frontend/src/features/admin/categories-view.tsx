'use client';

// Categories tree manager (spec 15.3): expandable tree with reorder (up/down +
// drag), create/edit forms (name, code, slug, SEO, image/icon publicIds,
// active toggle), move-to-parent, soft delete and the attribute mapping editor.
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Plus, Save, Trash2 } from 'lucide-react';
import { Button, Input, Select, Textarea } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { apiFetch } from '@/lib/api-client';
import { adminApi } from './admin-api';
import { AdminPageHeader } from './admin-shell';
import { flattenTree } from './products/product-form';
import type { AttributeDto, NavigationNodeDto } from '@/shared/dto/catalog.dto';

interface FlatNode {
  id: string;
  code: string;
  parentId: string | null;
  name: string;
  level: number;
  isActive: boolean;
  sortOrder: number;
}

function flattenRows(nodes: NavigationNodeDto[], parentId: string | null = null, level = 0, out: FlatNode[] = []): FlatNode[] {
  nodes.forEach((node, index) => {
    out.push({ id: node.id, code: node.code, parentId, name: node.name, level, isActive: true, sortOrder: index });
    flattenRows(node.children, node.id, level + 1, out);
  });
  return out;
}

export function CategoriesView() {
  const queryClient = useQueryClient();
  const treeQuery = useQuery({
    queryKey: ['admin', 'categories', 'tree'],
    queryFn: async (): Promise<NavigationNodeDto[]> =>
      (await apiFetch<NavigationNodeDto[]>('/navigation/tree', { query: { depth: 6 } })).data,
  });
  const attributesQuery = useQuery({
    queryKey: ['admin', 'attributes-all'],
    queryFn: async (): Promise<AttributeDto[]> => (await apiFetch<AttributeDto[]>('/attributes')).data,
  });

  const [editing, setEditing] = useState<{
    id: string | null;
    parentId: string;
    code: string;
    name: string;
    slug: string;
    description: string;
    seoTitle: string;
    seoDescription: string;
    imagePublicId: string;
    iconPublicId: string;
    isActive: boolean;
    sortOrder: string;
  } | null>(null);
  const [mappingFor, setMappingFor] = useState<{ id: string; code: string; name: string } | null>(null);
  const [mapping, setMapping] = useState<Array<{ attributeId: string; isRequired: boolean; isFilterable: boolean; isVariantAxis: boolean; filterWidget: string; sortOrder: number }>>([]);
  const [dragId, setDragId] = useState<string | null>(null);

  const rows = useMemo(() => flattenRows(treeQuery.data ?? []), [treeQuery.data]);
  const flat = useMemo(() => flattenTree(treeQuery.data ?? []), [treeQuery.data]);

  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'categories', 'tree'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'refs', 'tree'] });
  };

  const save = async () => {
    if (editing === null) return;
    if (editing.name.trim() === '') {
      toast({ title: 'Name is required', variant: 'error' });
      return;
    }
    try {
      const body = {
        name: editing.name.trim(),
        slug: editing.slug.trim() || undefined,
        description: editing.description || null,
        seoTitle: editing.seoTitle || null,
        seoDescription: editing.seoDescription || null,
        imagePublicId: editing.imagePublicId || null,
        iconPublicId: editing.iconPublicId || null,
        sortOrder: Number(editing.sortOrder) || 0,
        ...(editing.id === null ? {} : { isActive: editing.isActive }),
      };
      if (editing.id === null) {
        if (editing.code.trim() === '') {
          toast({ title: 'Category code (NN-NN-…) is required for new categories', variant: 'error' });
          return;
        }
        await adminApi.createCategory({
          ...body,
          code: editing.code.trim(),
          parentId: editing.parentId === '' ? null : editing.parentId,
        });
        toast({ title: 'Category created', variant: 'success' });
      } else {
        await adminApi.updateCategory(editing.id, body);
        toast({ title: 'Category saved', variant: 'success' });
      }
      setEditing(null);
      reload();
    } catch (error) {
      toast({ title: 'Could not save', description: error instanceof Error ? error.message : undefined, variant: 'error' });
    }
  };

  const remove = async (row: FlatNode) => {
    try {
      await adminApi.deleteCategory(row.id);
      toast({ title: `Deleted ${row.name}`, variant: 'success' });
      reload();
    } catch (error) {
      toast({ title: 'Could not delete (children or products?)', description: error instanceof Error ? error.message : undefined, variant: 'error' });
    }
  };

  const move = async (row: FlatNode, newParentId: string | null) => {
    try {
      await adminApi.moveCategory({ id: row.id, newParentId });
      toast({ title: 'Category moved', variant: 'success' });
      reload();
    } catch (error) {
      toast({ title: 'Move failed', description: error instanceof Error ? error.message : undefined, variant: 'error' });
    }
  };

  const reorderSibling = async (row: FlatNode, direction: -1 | 1) => {
    const siblings = rows.filter((candidate) => candidate.parentId === row.parentId);
    const index = siblings.findIndex((candidate) => candidate.id === row.id);
    const swapWith = siblings[index + direction];
    if (!swapWith) return;
    try {
      await adminApi.reorderCategories([
        { id: row.id, sortOrder: swapWith.sortOrder },
        { id: swapWith.id, sortOrder: row.sortOrder },
      ]);
      reload();
    } catch (error) {
      toast({ title: 'Reorder failed', description: error instanceof Error ? error.message : undefined, variant: 'error' });
    }
  };

  const onDrop = async (target: FlatNode) => {
    if (dragId === null || dragId === target.id) return;
    const dragged = rows.find((row) => row.id === dragId);
    setDragId(null);
    if (!dragged) return;
    // Dropping ONTO a row makes it a child; the tree rejects cycles server-side.
    await move(dragged, target.id);
  };

  const openMapping = async (row: FlatNode) => {
    setMappingFor({ id: row.id, code: row.code, name: row.name });
    const { data } = await apiFetch<Array<{ id: string; isRequired: boolean; isFilterable: boolean; isVariantAxis: boolean; filterWidget: string; sortOrder: number }>>(
      `/categories/${encodeURIComponent(row.code)}/filters`,
    );
    setMapping(
      data.map((def) => ({
        attributeId: def.id,
        isRequired: def.isRequired,
        isFilterable: def.isFilterable,
        isVariantAxis: def.isVariantAxis,
        filterWidget: def.filterWidget,
        sortOrder: def.sortOrder,
      })),
    );
  };

  const saveMapping = async () => {
    if (mappingFor === null) return;
    try {
      await adminApi.putCategoryAttributes(mappingFor.id, {
        attributes: mapping.map((entry) => ({
          attributeId: entry.attributeId,
          isRequired: entry.isRequired,
          isFilterable: entry.isFilterable,
          isVariantAxis: entry.isVariantAxis,
          filterWidget: entry.filterWidget,
          sortOrder: entry.sortOrder,
        })),
      });
      toast({ title: 'Attribute mapping saved', variant: 'success' });
      setMappingFor(null);
      reload();
    } catch (error) {
      toast({ title: 'Could not save mapping', description: error instanceof Error ? error.message : undefined, variant: 'error' });
    }
  };

  return (
    <div>
      <AdminPageHeader title="Categories">
        <Button
          variant="primary"
          size="sm"
          onClick={() =>
            setEditing({
              id: null,
              parentId: '',
              code: '',
              name: '',
              slug: '',
              description: '',
              seoTitle: '',
              seoDescription: '',
              imagePublicId: '',
              iconPublicId: '',
              isActive: true,
              sortOrder: '0',
            })
          }
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New category
        </Button>
      </AdminPageHeader>

      <ul className="rounded-tile border border-line">
        {rows.map((row, index) => {
          const siblings = rows.filter((candidate) => candidate.parentId === row.parentId);
          const siblingIndex = siblings.findIndex((candidate) => candidate.id === row.id);
          return (
            <li
              key={row.id}
              draggable
              onDragStart={() => setDragId(row.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => void onDrop(row)}
              className={`flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-sm last:border-b-0 ${dragId === row.id ? 'opacity-50' : ''}`}
            >
              <span style={{ paddingLeft: `${row.level * 20}px` }} className="font-medium">
                {row.level > 0 ? <ChevronRight className="me-1 inline h-3 w-3 text-muted" aria-hidden="true" /> : null}
                {row.name}
              </span>
              <span className="text-xs text-muted">{row.code}</span>
              <span className="ms-auto flex items-center gap-1">
                <Button variant="ghost" size="sm" aria-label="Move up" disabled={siblingIndex <= 0} onClick={() => void reorderSibling(row, -1)}>
                  <ChevronRight className="h-4 w-4 -rotate-90" aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="sm" aria-label="Move down" disabled={siblingIndex >= siblings.length - 1} onClick={() => void reorderSibling(row, 1)}>
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </Button>
                <button type="button" className="text-xs font-bold text-brand underline underline-offset-2" onClick={() => void openMapping(row)}>
                  Attributes
                </button>
                <button
                  type="button"
                  className="text-xs font-bold text-brand underline underline-offset-2"
                  onClick={() => {
                    void (async () => {
                      const { data } = await apiFetch<import('@/shared/dto/catalog.dto').CategoryDto>(
                        `/categories/${encodeURIComponent(row.code)}`,
                      );
                      setEditing({
                        id: data.id,
                        parentId: '',
                        code: data.code,
                        name: data.name,
                        slug: data.slug,
                        description: data.description ?? '',
                        seoTitle: data.seoTitle ?? '',
                        seoDescription: data.seoDescription ?? '',
                        // image/icon come back as /media/{publicId} URLs — store the bare publicId.
                        imagePublicId: data.image?.replace(/^\/media\//, '') ?? '',
                        iconPublicId: data.icon?.replace(/^\/media\//, '') ?? '',
                        isActive: data.isActive,
                        sortOrder: '0',
                      });
                    })();
                  }}
                >
                  Edit
                </button>
                <button type="button" className="text-xs font-bold text-stock-red underline underline-offset-2" onClick={() => void remove(row)}>
                  Delete
                </button>
              </span>
              <p className="sr-only">{index}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">
        Drag a row onto another to make it a child (the server rejects cycles); the arrows reorder siblings.
      </p>

      {editing ? (
        <div className="mt-6 rounded-tile border border-brand/50 bg-white p-4">
          <p className="mb-3 text-sm font-bold">{editing.id === null ? 'New category' : `Edit ${editing.name}`}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {editing.id === null ? (
              <>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Parent category</span>
                  <Select
                    value={editing.parentId}
                    onValueChange={(value) => setEditing((prev) => prev && ({ ...prev, parentId: value }))}
                    options={[{ value: '', label: '— top level —' }, ...flat.map((node) => ({ value: node.id, label: `${'\u00a0\u00a0'.repeat(node.level)}${node.label}` }))]}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Code (NN-NN-NN-NN-NN) *</span>
                  <Input value={editing.code} onChange={(event) => setEditing((prev) => prev && ({ ...prev, code: event.target.value }))} placeholder="10-05-03" />
                </label>
              </>
            ) : null}
            <label className="text-sm">
              <span className="mb-1 block text-muted">Name *</span>
              <Input value={editing.name} onChange={(event) => setEditing((prev) => prev && ({ ...prev, name: event.target.value }))} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Slug (auto when empty)</span>
              <Input value={editing.slug} onChange={(event) => setEditing((prev) => prev && ({ ...prev, slug: event.target.value }))} />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-muted">Description</span>
              <Textarea rows={2} value={editing.description} onChange={(event) => setEditing((prev) => prev && ({ ...prev, description: event.target.value }))} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">SEO title</span>
              <Input value={editing.seoTitle} onChange={(event) => setEditing((prev) => prev && ({ ...prev, seoTitle: event.target.value }))} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">SEO description</span>
              <Input value={editing.seoDescription} onChange={(event) => setEditing((prev) => prev && ({ ...prev, seoDescription: event.target.value }))} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Image publicId</span>
              <Input value={editing.imagePublicId} onChange={(event) => setEditing((prev) => prev && ({ ...prev, imagePublicId: event.target.value }))} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Icon publicId</span>
              <Input value={editing.iconPublicId} onChange={(event) => setEditing((prev) => prev && ({ ...prev, iconPublicId: event.target.value }))} />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" size="sm" onClick={() => void save()}>
              <Save className="h-4 w-4" aria-hidden="true" />
              Save
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {mappingFor ? (
        <div className="mt-6 rounded-tile border border-brand/50 bg-white p-4">
          <p className="mb-1 text-sm font-bold">Attribute mapping — {mappingFor.name}</p>
          <p className="mb-3 text-xs text-muted">
            Which attributes apply to this category, which are filterable or variant axes, and the filter widget.
          </p>
          <div className="space-y-2">
            {(attributesQuery.data ?? []).map((def) => {
              const entry = mapping.find((candidate) => candidate.attributeId === def.id);
              return (
                <label key={def.id} className="flex flex-wrap items-center gap-3 rounded-tile border border-line p-3 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--brand-orange)]"
                    checked={entry !== undefined}
                    onChange={(event) =>
                      setMapping((prev) =>
                        event.target.checked
                          ? [...prev, { attributeId: def.id, isRequired: false, isFilterable: true, isVariantAxis: false, filterWidget: 'CHECKBOX', sortOrder: prev.length }]
                          : prev.filter((candidate) => candidate.attributeId !== def.id),
                      )
                    }
                  />
                  <span className="min-w-40">
                    <span className="font-medium">{def.label}</span>
                    <span className="block text-xs text-muted">{def.key} · {def.type}</span>
                  </span>
                  {entry ? (
                    <span className="flex flex-wrap items-center gap-3 text-xs">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-[var(--brand-orange)]"
                          checked={entry.isRequired}
                          onChange={(event) =>
                            setMapping((prev) => prev.map((candidate) => (candidate.attributeId === def.id ? { ...candidate, isRequired: event.target.checked } : candidate)))
                          }
                        />
                        required
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-[var(--brand-orange)]"
                          checked={entry.isFilterable}
                          onChange={(event) =>
                            setMapping((prev) => prev.map((candidate) => (candidate.attributeId === def.id ? { ...candidate, isFilterable: event.target.checked } : candidate)))
                          }
                        />
                        filterable
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-[var(--brand-orange)]"
                          checked={entry.isVariantAxis}
                          onChange={(event) =>
                            setMapping((prev) => prev.map((candidate) => (candidate.attributeId === def.id ? { ...candidate, isVariantAxis: event.target.checked } : candidate)))
                          }
                        />
                        variant axis
                      </label>
                      <Select
                        className="w-32"
                        value={entry.filterWidget}
                        options={['CHECKBOX', 'RANGE', 'DROPDOWN'].map((value) => ({ value, label: value }))}
                        onValueChange={(value) =>
                          setMapping((prev) => prev.map((candidate) => (candidate.attributeId === def.id ? { ...candidate, filterWidget: value } : candidate)))
                        }
                      />
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" size="sm" onClick={() => void saveMapping()}>
              Save mapping
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMappingFor(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
