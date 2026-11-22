import type { Metadata } from 'next';
import { DashboardView } from '@/features/admin/dashboard-view';

export const metadata: Metadata = {
  title: 'Dashboard — Admin',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <DashboardView />;
}
