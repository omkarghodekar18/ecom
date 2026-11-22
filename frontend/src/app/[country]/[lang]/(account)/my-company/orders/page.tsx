// Order history (spec 6.9): the caller's orders with status and totals.
import type { Metadata } from 'next';
import { OrdersView } from '@/features/orders/orders-view';

export const metadata: Metadata = {
  title: 'Orders',
  robots: { index: false, follow: false },
};

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ country: string; lang: string }>;
}) {
  const { country, lang } = await params;
  return (
    <div>
      <h1 className="text-xl font-bold lg:text-2xl">Your orders</h1>
      <div className="mt-6">
        <OrdersView locale={`/${country}/${lang}`} />
      </div>
    </div>
  );
}
