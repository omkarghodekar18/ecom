import type { Metadata } from 'next';
import { CategoriesView } from '@/features/admin/categories-view';

export const metadata: Metadata = {
  title: 'Categories — Admin',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <CategoriesView />;
}
