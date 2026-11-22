// Order detail (spec 6.9): line snapshots, status timeline, reorder, invoice
// download placeholder.
import type { Metadata } from 'next';
import { OrderDetailView } from '@/features/orders/orders-view';

export const metadata: Metadata = {
  title: 'Order detail',
  robots: { index: false, follow: false },
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ country: string; lang: string; orderNo: string }>;
}) {
  const { country, lang, orderNo } = await params;
  return <OrderDetailView locale={`/${country}/${lang}`} orderNo={orderNo} />;
}
