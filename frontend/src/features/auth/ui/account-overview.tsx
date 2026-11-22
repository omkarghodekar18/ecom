'use client';

// Account overview (spec 6.9): greeting, account-type/company card, quick
// links and a recent-orders placeholder. No fake data — the order list ships
// with the checkout phase.
import Link from 'next/link';
import { Building2, MapPin, PackageOpen, ShieldCheck, User } from 'lucide-react';
import { routes } from '@/config/routes';
import { Badge, Skeleton } from '@/components/ui';
import { useAuth } from '../auth-provider';
import { useMe } from '../hooks';
import { AccountPending } from './account-pending';

export function AccountOverview({ locale }: { locale: string }) {
  const { status } = useAuth();
  const { data: user, isLoading } = useMe();
  const r = routes(locale);

  if (status !== 'authenticated') return <AccountPending />;
  if (isLoading || !user) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const isB2B = user.type === 'B2B';

  return (
    <section aria-labelledby="overview-heading" className="space-y-6">
      <div>
        <h1 id="overview-heading" className="text-2xl font-bold text-ink">
          Hello, {user.firstName}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Signed in as <span className="text-ink">{user.email}</span>
        </p>
      </div>

      <div className="rounded-tile border border-line bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-ink">Account details</h2>
          <Badge variant={isB2B ? 'brand' : 'neutral'}>
            {isB2B ? 'Business customer (B2B)' : 'Personal account (B2C)'}
          </Badge>
        </div>
        <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div className="flex flex-col">
            <dt className="text-muted">Name</dt>
            <dd className="font-medium text-ink">
              {user.firstName} {user.lastName}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-muted">Email</dt>
            <dd className="font-medium text-ink">{user.email}</dd>
          </div>
          {isB2B ? (
            <div className="flex flex-col">
              <dt className="text-muted">Company</dt>
              <dd className="font-medium text-ink">{user.companyName ?? 'Not assigned yet'}</dd>
            </div>
          ) : null}
          <div className="flex flex-col">
            <dt className="text-muted">Email verified</dt>
            <dd className="font-medium text-ink">{user.emailVerified ? 'Yes' : 'No'}</dd>
          </div>
        </dl>
      </div>

      <div>
        <h2 className="text-base font-bold text-ink">Quick links</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickLink href={r.accountSection('profile')} icon={<User className="h-5 w-5" aria-hidden="true" />} label="Profile" description="Name and contact details" />
          <QuickLink href={r.accountSection('addresses')} icon={<MapPin className="h-5 w-5" aria-hidden="true" />} label="Addresses" description="Shipping and billing addresses" />
          <QuickLink href={r.accountSection('security')} icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />} label="Security" description="Password and active sessions" />
          {isB2B ? (
            <QuickLink href={`${locale}/my-company`} icon={<Building2 className="h-5 w-5" aria-hidden="true" />} label="Company" description="Company details and users" />
          ) : null}
        </div>
      </div>

      <div className="rounded-tile border border-line bg-white p-6">
        <h2 className="text-base font-bold text-ink">Recent orders</h2>
        <div className="mt-4 flex items-start gap-3 text-sm text-muted">
          <PackageOpen className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>Order history arrives with the checkout phase.</p>
        </div>
      </div>
    </section>
  );
}

function QuickLink({
  href,
  icon,
  label,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-tile border border-line bg-white p-4 transition-colors hover:border-brand focus-visible:outline-none"
    >
      <span className="text-brand" aria-hidden="true">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-bold text-ink">{label}</span>
        <span className="block text-xs text-muted">{description}</span>
      </span>
    </Link>
  );
}
