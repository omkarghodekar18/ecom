import type { Metadata } from 'next';
import { AttributesView } from '@/features/admin/attributes-view';

export const metadata: Metadata = {
  title: 'Attributes — Admin',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AttributesView />;
}
