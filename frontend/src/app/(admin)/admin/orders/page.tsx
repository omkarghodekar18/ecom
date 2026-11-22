import type { Metadata } from 'next';
import { AdminOrdersView } from '@/features/admin/orders-view';

export const metadata: Metadata = {
  title: 'Orders — Admin',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminOrdersView />;
}
