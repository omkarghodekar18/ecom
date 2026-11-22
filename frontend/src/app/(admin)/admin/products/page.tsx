import type { Metadata } from 'next';
import { ProductsListView } from '@/features/admin/products/products-list-view';

export const metadata: Metadata = {
  title: 'Products — Admin',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ProductsListView />;
}
