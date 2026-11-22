import type { Metadata } from 'next';
import { ProductForm } from '@/features/admin/products/product-form';

export const metadata: Metadata = {
  title: 'New product — Admin',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ProductForm mode="create" />;
}
