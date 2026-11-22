// Quick order page (spec 6.10, route spec 7): article-number quick entry.
import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/seo/breadcrumbs';
import { QuickOrderView } from '@/features/quick-order/quick-order-view';

export const metadata: Metadata = {
  title: 'Quick order',
  robots: { index: false, follow: false },
};

export default async function QuickOrderPage({
  params,
}: {
  params: Promise<{ country: string; lang: string }>;
}) {
  const { country, lang } = await params;
  const locale = `/${country}/${lang}`;
  return (
    <div className="page-container pt-4 lg:pt-6">
      <Breadcrumbs items={[{ name: 'Home', href: locale }, { name: 'Quick order' }]} />
      <div className="mt-4">
        <QuickOrderView />
      </div>
    </div>
  );
}
