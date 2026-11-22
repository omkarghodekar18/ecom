import type { Metadata } from 'next';
import { CustomersView } from '@/features/admin/customers-view';

export const metadata: Metadata = {
  title: 'Customers — Admin',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <CustomersView />;
}
