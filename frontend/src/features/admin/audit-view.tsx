'use client';

// Audit log viewer (spec 15.10): paginated trail with entity filter and free
// text; diffs render as pretty JSON.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select, Skeleton } from '@/components/ui';
import { adminApi } from './admin-api';
import { AdminPageHeader } from './admin-shell';
import { formatDateTime } from '@/lib/format';

export function AuditView() {
  const [entity, setEntity] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['admin', 'audit', { entity, q, page }],
    queryFn: () => adminApi.listAudit({ entity: entity || undefined, q: q || undefined, page, pageSize: 25 }),
  });
  const meta = query.data?.meta;

  return (
    <div>
      <AdminPageHeader title="Audit log" />
      <form className="mb-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); }}>
        <Input
          value={q}
          onChange={(event) => { setQ(event.target.value); setPage(1); }}
          placeholder="Action or entity id"
          aria-label="Search audit trail"
          className="min-w-56 flex-1"
        />
        <Select
          value={entity}
          onValueChange={(value) => { setEntity(value); setPage(1); }}
          options={[
            { value: '', label: 'All entities' },
            ...['product', 'variant', 'category', 'attribute', 'brand', 'banner', 'cms_page', 'order', 'user', 'company', 'settings'].map((value) => ({ value, label: value })),
          ]}
          className="w-44"
        />
      </form>

      {query.isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-12" />)}</div>
      ) : (
        <ul className="divide-y divide-line rounded-tile border border-line text-sm">
          {(query.data?.data ?? []).map((entry) => (
            <li key={entry.id} className="px-4 py-3">
              <p className="flex flex-wrap items-baseline gap-2">
                <span className="font-bold text-ink">{entry.action}</span>
                <span className="text-xs text-muted">
                  {entry.entity}
                  {entry.entityId ? `#${entry.entityId.slice(0, 10)}` : ''}
                </span>
                <span className="ms-auto text-xs text-muted">
                  {entry.actorEmail ?? 'system'} · {entry.ip ?? ''} · {formatDateTime(entry.createdAt)}
                </span>
              </p>
              {entry.diff ? (
                <pre className="mt-1 max-h-32 overflow-auto rounded-btn bg-tile p-2 text-xs text-muted">
                  {JSON.stringify(entry.diff, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
          {(query.data?.data ?? []).length === 0 ? (
            <li className="px-4 py-8 text-center text-muted">Nothing recorded yet.</li>
          ) : null}
        </ul>
      )}

      {meta && meta.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-muted">Page {meta.page} of {meta.totalPages} · {meta.total} entries</span>
          <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      ) : null}
    </div>
  );
}
