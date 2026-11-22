// Checkout page (spec 6.7, route spec 7): auth-gated, noindex.
import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/seo/breadcrumbs';
import { CheckoutView } from '@/features/checkout/checkout-view';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ country: string; lang: string }>;
}) {
  const { country, lang } = await params;
  const locale = `/${country}/${lang}`;
  return (
    <div className="page-container pt-4 lg:pt-6">
      <Breadcrumbs items={[{ name: 'Home', href: locale }, { name: 'Checkout' }]} />
      <h1 className="mt-4 text-2xl font-bold lg:text-[40px]">Checkout</h1>
      <div className="mt-6">
        <CheckoutView locale={locale} />
      </div>
    </div>
  );
}
