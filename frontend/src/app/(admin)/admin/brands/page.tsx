import type { Metadata } from 'next';
import { BrandsView } from '@/features/admin/brands-view';

export const metadata: Metadata = {
  title: 'Brands — Admin',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <BrandsView />;
}
