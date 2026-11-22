// Cart page (spec 6.6, route spec 7): guest + signed-in cart, noindex.
import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/seo/breadcrumbs';
import { CartView } from '@/features/cart/cart-view';

export const metadata: Metadata = {
  title: 'Shopping cart',
  robots: { index: false, follow: false },
};

export default async function CartPage({
  params,
}: {
  params: Promise<{ country: string; lang: string }>;
}) {
  const { country, lang } = await params;
  const locale = `/${country}/${lang}`;
  return (
    <div className="page-container pt-4 lg:pt-6">
      <Breadcrumbs items={[{ name: 'Home', href: locale }, { name: 'Shopping cart' }]} />
      <h1 className="mt-4 text-2xl font-bold lg:text-[40px]">Shopping cart</h1>
      <div className="mt-6">
        <CartView locale={locale} />
      </div>
    </div>
  );
}
