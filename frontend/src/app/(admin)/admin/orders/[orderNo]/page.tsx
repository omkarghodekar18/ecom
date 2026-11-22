import type { Metadata } from 'next';
import { AdminOrderDetail } from '@/features/admin/orders-view';

export const metadata: Metadata = {
  title: 'Order — Admin',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  return <AdminOrderDetail orderNo={orderNo} />;
}
