'use client';

// Attribute definitions management (spec 15.4): CRUD with type/unit/enum
// values. Type changes and deletes of in-use attributes are blocked server-side.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { apiFetch } from '@/lib/api-client';
import { adminApi } from './admin-api';
import { AdminPageHeader } from './admin-shell';
import type { AttributeDto } from '@/shared/dto/catalog.dto';

function AttributesPanel() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: ['admin', 'attributes-all'],
    queryFn: async (): Promise<AttributeDto[]> => (await apiFetch<AttributeDto[]>('/attributes')).data,
  });
  const [editing, setEditing] = useState<{ id: string | null; key: string; label: string; labelHtml: string; groupName: string; type: string; unit: string; enumValues: string } | null>(null);

  const save = async () => {
    if (editing === null || editing.label.trim() === '' || editing.groupName.trim() === '') return;
    try {
      const body = {
        label: editing.label.trim(),
        labelHtml: editing.labelHtml || null,
        groupName: editing.groupName.trim(),
        type: editing.type,
        unit: editing.unit || null,
        enumValues: editing.type === 'ENUM' ? editing.enumValues.split(',').map((value) => value.trim()).filter((value) => value !== '') : null,
      };
      if (editing.id === null) {
        await adminApi.createAttribute({ ...body, key: editing.key.trim() });
      } else {
        await adminApi.updateAttribute(editing.id, body);
      }
      toast({ title: 'Attribute saved', variant: 'success' });
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'attributes-all'] });
    } catch (error) {
      toast({ title: 'Could not save', description: error instanceof Error ? error.message : undefined, variant: 'error' });
    }
  };

  return (
    <section aria-labelledby="attributes-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="attributes-heading" className="text-sm font-bold uppercase tracking-wide text-muted">Attribute definitions</h2>
        <Button variant="outline" size="sm" onClick={() => setEditing({ id: null, key: '', label: '', labelHtml: '', groupName: '', type: 'STRING', unit: '', enumValues: '' })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New attribute
        </Button>
      </div>
      <ul className="divide-y divide-line rounded-tile border border-line text-sm">
        {(listQuery.data ?? []).map((attribute) => (
          <li key={attribute.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{attribute.label}</span>
              <span className="ms-2 text-xs text-muted">
                {attribute.key} · {attribute.type}
                {attribute.unit ? ` (${attribute.unit})` : ''} · {attribute.groupName}
              </span>
            </span>
            <button
              type="button"
              className="text-xs font-bold text-brand underline underline-offset-2"
              onClick={() =>
                setEditing({
                  id: attribute.id,
                  key: attribute.key,
                  label: attribute.label,
                  labelHtml: attribute.labelHtml ?? '',
                  groupName: attribute.groupName,
                  type: attribute.type,
                  unit: attribute.unit ?? '',
                  enumValues: (attribute.enumValues ?? []).join(', '),
                })
              }
            >
              Edit
            </button>
            <button
              type="button"
              className="text-xs font-bold text-stock-red underline underline-offset-2"
              onClick={async () => {
                try {
                  await adminApi.deleteAttribute(attribute.id);
                  toast({ title: 'Attribute deleted', variant: 'success' });
                  void queryClient.invalidateQueries({ queryKey: ['admin', 'attributes-all'] });
                } catch (error) {
                  toast({ title: 'Could not delete (in use?)', description: error instanceof Error ? error.message : undefined, variant: 'error' });
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
          {editing.id === null ? (
            <label className="text-sm">
              <span className="mb-1 block text-muted">Key (immutable, snake_case) *</span>
              <Input value={editing.key} onChange={(event) => setEditing((prev) => prev && { ...prev, key: event.target.value })} placeholder="tool_material" />
            </label>
          ) : null}
          <label className="text-sm">
            <span className="mb-1 block text-muted">Label *</span>
            <Input value={editing.label} onChange={(event) => setEditing((prev) => prev && { ...prev, label: event.target.value })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Label HTML (subscripts)</span>
            <Input value={editing.labelHtml} onChange={(event) => setEditing((prev) => prev && { ...prev, labelHtml: event.target.value })} placeholder="Diameter D&lt;sub&gt;c&lt;/sub&gt;" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Filter group *</span>
            <Input value={editing.groupName} onChange={(event) => setEditing((prev) => prev && { ...prev, groupName: event.target.value })} placeholder="Dimensions &amp; Measurements" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Type</span>
            <Select
              value={editing.type}
              onValueChange={(value) => setEditing((prev) => prev && { ...prev, type: value })}
              options={['STRING', 'NUMBER', 'BOOLEAN', 'ENUM'].map((value) => ({ value, label: value }))}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Unit</span>
            <Input value={editing.unit} onChange={(event) => setEditing((prev) => prev && { ...prev, unit: event.target.value })} placeholder="mm" />
          </label>
          {editing.type === 'ENUM' ? (
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-muted">Allowed values (comma-separated)</span>
              <Input value={editing.enumValues} onChange={(event) => setEditing((prev) => prev && { ...prev, enumValues: event.target.value })} placeholder="HSS, HSS-E, Carbide" />
            </label>
          ) : null}
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

export function AttributesView() {
  return (
    <div>
      <AdminPageHeader title="Attributes" />
      <AttributesPanel />
    </div>
  );
}
