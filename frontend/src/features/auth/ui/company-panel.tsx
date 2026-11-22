'use client';

// Company page (spec 6.9, B2B only): company card + users table from
// GET /companies/me. B2C accounts see a friendly empty state.
import { Building2 } from 'lucide-react';
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorState,
  Skeleton,
  type DataTableColumn,
} from '@/components/ui';
import { formatDate } from '@/lib/format';
import { apiErrorMessage } from '../auth-api';
import { useAuth } from '../auth-provider';
import { useMe, useMyCompany } from '../hooks';
import type { CompanyUserDto } from '@/shared/dto/company.dto';
import { AccountPending } from './account-pending';

export function CompanyPanel() {
  const { status } = useAuth();
  const { data: user, isLoading: meLoading } = useMe();

  if (status !== 'authenticated') return <AccountPending />;
  if (meLoading || !user) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (user.type !== 'B2B') {
    return (
      <section aria-labelledby="company-heading" className="space-y-6">
        <h1 id="company-heading" className="text-2xl font-bold text-ink">
          Company
        </h1>
        <EmptyState
          icon={<Building2 className="h-10 w-10" strokeWidth={1.5} />}
          title="Company accounts are available for business customers."
          description="Your account is a personal (B2C) account. Register a business account to see company details and colleagues."
        />
      </section>
    );
  }

  return <CompanyContent />;
}

function CompanyContent() {
  const { data: company, isLoading, isError, error, refetch } = useMyCompany(true);

  const columns: DataTableColumn<CompanyUserDto>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => `${row.firstName} ${row.lastName}`,
    },
    { key: 'email', header: 'Email' },
    {
      key: 'role',
      header: 'Role',
      render: (row) => <Badge variant="count">{row.role}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) =>
        row.isActive ? <Badge variant="neutral">Active</Badge> : <Badge variant="neutral">Inactive</Badge>,
    },
    {
      key: 'lastLoginAt',
      header: 'Last sign-in',
      render: (row) => (row.lastLoginAt ? formatDate(row.lastLoginAt) : '—'),
    },
  ];

  return (
    <section aria-labelledby="company-heading" className="space-y-6">
      <h1 id="company-heading" className="text-2xl font-bold text-ink">
        Company
      </h1>

      {isLoading ? (
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : isError ? (
        <ErrorState
          title="Could not load company details"
          message={apiErrorMessage(error, 'Please try again.')}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : company ? (
        <>
          <div className="rounded-tile border border-line bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold text-ink">{company.name}</h2>
              <Badge variant="brand">Business customer</Badge>
            </div>
            <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div className="flex flex-col">
                <dt className="text-muted">GSTIN</dt>
                <dd className="font-medium text-ink">{company.gstin ?? '—'}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-muted">Customer number</dt>
                <dd className="font-medium text-ink">{company.customerNumber ?? '—'}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-ink">Users</h2>
            <DataTable
              columns={columns}
              rows={company.users}
              rowKey={(row) => row.id}
              scrollClassName="max-h-96"
            />
          </div>
        </>
      ) : null}
    </section>
  );
}
