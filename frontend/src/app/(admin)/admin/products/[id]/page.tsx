import type { Metadata } from 'next';
import { ProductForm } from '@/features/admin/products/product-form';

export const metadata: Metadata = {
  title: 'Edit product — Admin',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductForm mode="edit" productId={id} />;
}
