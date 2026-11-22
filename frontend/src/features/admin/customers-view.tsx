'use client';

// Customers & companies admin (spec 15.7): user list with role/activation
// controls and the company list with inline edits.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { Badge, Button, Input, Select, Skeleton } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { adminApi, type AdminCompany } from './admin-api';
import { AdminPageHeader } from './admin-shell';
import { formatDate } from '@/lib/format';

export function CustomersView() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const usersQuery = useQuery({
    queryKey: ['admin', 'users', { q, role, page }],
    queryFn: () => adminApi.listUsers({ q: q || undefined, role: role || undefined, page, pageSize: 20 }),
  });
  const companiesQuery = useQuery({ queryKey: ['admin', 'companies'], queryFn: adminApi.listCompanies });

  const updateUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { isActive?: boolean; role?: 'CUSTOMER' | 'STAFF' | 'ADMIN' } }) =>
      adminApi.updateUser(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast({ title: 'User updated', variant: 'success' });
    },
    onError: (error: Error) => toast({ title: 'Update failed', description: error.message, variant: 'error' }),
  });

  const [companyDraft, setCompanyDraft] = useState<Record<string, { name: string; gstin: string; customerNumber: string }>>({});
  const updateCompany = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; gstin?: string; customerNumber?: string } }) =>
      adminApi.updateCompany(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] });
      toast({ title: 'Company updated', variant: 'success' });
    },
    onError: (error: Error) => toast({ title: 'Update failed', description: error.message, variant: 'error' }),
  });

  const meta = usersQuery.data?.meta;

  return (
    <div>
      <AdminPageHeader title="Customers &amp; companies" />

      <form className="mb-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); }}>
        <Input
          value={q}
          onChange={(event) => { setQ(event.target.value); setPage(1); }}
          placeholder="Search email or name"
          aria-label="Search users"
          className="min-w-56 flex-1"
        />
        <Select
          value={role}
          onValueChange={(value) => { setRole(value); setPage(1); }}
          options={[
            { value: '', label: 'All roles' },
            { value: 'CUSTOMER', label: 'Customers' },
            { value: 'STAFF', label: 'Staff' },
            { value: 'ADMIN', label: 'Admins' },
          ]}
          className="w-40"
        />
      </form>

      {usersQuery.isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-12" />)}</div>
      ) : (
        <div className="overflow-x-auto rounded-tile border border-line">
          <table className="w-full text-sm">
            <thead className="bg-tile text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-bold">User</th>
                <th className="px-4 py-2.5 font-bold">Company</th>
                <th className="px-4 py-2.5 font-bold">Role</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 font-bold">Joined</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(usersQuery.data?.data ?? []).map((user) => (
                <tr key={user.id} className="hover:bg-tile/60">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{user.name}</span>
                    <span className="block text-xs text-muted">{user.email} · {user.type}{user.emailVerified ? '' : ' · unverified'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs">{user.companyName ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <Select
                      value={user.role}
                      onValueChange={(value) => updateUser.mutate({ id: user.id, body: { role: value as 'CUSTOMER' | 'STAFF' | 'ADMIN' } })}
                      options={[
                        { value: 'CUSTOMER', label: 'Customer' },
                        { value: 'STAFF', label: 'Staff' },
                        { value: 'ADMIN', label: 'Admin' },
                      ]}
                      className="w-32"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={user.isActive ? 'brand' : 'neutral'}>{user.isActive ? 'active' : 'deactivated'}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">{formatDate(user.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      className="text-xs font-bold text-stock-red underline underline-offset-2"
                      onClick={() => updateUser.mutate({ id: user.id, body: { isActive: !user.isActive } })}
                    >
                      {user.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-muted">Page {meta.page} of {meta.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      ) : null}

      <h2 className="mt-10 text-sm font-bold uppercase tracking-wide text-muted">Companies</h2>
      <div className="mt-2 space-y-2">
        {(companiesQuery.data ?? []).map((company: AdminCompany) => {
          const draft = companyDraft[company.id] ?? {
            name: company.name,
            gstin: company.gstin ?? '',
            customerNumber: company.customerNumber ?? '',
          };
          return (
            <div key={company.id} className="grid items-end gap-2 rounded-tile border border-line p-3 sm:grid-cols-[1fr_150px_150px_auto_auto]">
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted">Name</span>
                <Input value={draft.name} onChange={(event) => setCompanyDraft((prev) => ({ ...prev, [company.id]: { ...draft, name: event.target.value } }))} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted">GSTIN</span>
                <Input value={draft.gstin} onChange={(event) => setCompanyDraft((prev) => ({ ...prev, [company.id]: { ...draft, gstin: event.target.value } }))} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted">Customer no.</span>
                <Input value={draft.customerNumber} onChange={(event) => setCompanyDraft((prev) => ({ ...prev, [company.id]: { ...draft, customerNumber: event.target.value } }))} />
              </label>
              <p className="text-xs text-muted">{company.users} users · {company.customerPrices} prices</p>
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  updateCompany.mutate({
                    id: company.id,
                    body: { name: draft.name, gstin: draft.gstin || undefined, customerNumber: draft.customerNumber || undefined },
                  })
                }
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                Save
              </Button>
            </div>
          );
        })}
        {(companiesQuery.data ?? []).length === 0 ? (
          <p className="rounded-tile border border-line p-4 text-sm text-muted">No companies yet.</p>
        ) : null}
      </div>
    </div>
  );
}
