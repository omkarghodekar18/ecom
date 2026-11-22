import type { Metadata } from 'next';
import { AuditView } from '@/features/admin/audit-view';

export const metadata: Metadata = {
  title: 'Audit log — Admin',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AuditView />;
}
