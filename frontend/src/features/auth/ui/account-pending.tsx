'use client';

// Shared fallback for account pages while the auth boot refresh is still in
// flight (queries stay disabled until status === 'authenticated').
import { Spinner } from '@/components/ui';

export function AccountPending({ label = 'Loading your account…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 p-8 text-sm text-muted" role="status">
      <Spinner size="sm" />
      {label}
    </div>
  );
}
