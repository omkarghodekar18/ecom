// Order confirmation page (spec 6.7): shows the placed order summary.
import type { Metadata } from 'next';
import { CheckCircle2 } from 'lucide-react';
import { Breadcrumbs } from '@/components/seo/breadcrumbs';
import { Button } from '@/components/ui';
import { routes } from '@/config/routes';

export const metadata: Metadata = {
  title: 'Order confirmed',
  robots: { index: false, follow: false },
};

export default async function CheckoutSuccessPage({
  params,
}: {
  params: Promise<{ country: string; lang: string; orderNo: string }>;
}) {
  const { country, lang, orderNo } = await params;
  const locale = `/${country}/${lang}`;
  const r = routes(locale);
  return (
    <div className="page-container pt-4 lg:pt-6">
      <Breadcrumbs items={[{ name: 'Home', href: r.home }, { name: 'Order confirmation' }]} />
      <div className="mx-auto max-w-xl py-16 text-center">
        <CheckCircle2 className="mx-auto h-16 w-16 text-stock-green" aria-hidden="true" />
        <h1 className="mt-6 text-2xl font-bold lg:text-[40px]">Thank you for your order</h1>
        <p className="mt-3 text-sm text-muted">
          Your order <span className="font-bold text-ink">{orderNo}</span> has been placed. A confirmation email is on
          its way; you can follow the status in your account.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button href={r.orderDetail(orderNo)} variant="primary">
            View order
          </Button>
          <Button href={r.companyOrders} variant="outline">
            Order history
          </Button>
          <Button href={r.home} variant="ghost">
            Continue shopping
          </Button>
        </div>
      </div>
    </div>
  );
}
