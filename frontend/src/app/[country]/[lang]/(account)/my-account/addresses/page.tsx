import type { Metadata } from 'next';
import { AddressesManager } from '@/features/auth/ui/addresses-manager';

export const metadata: Metadata = {
  title: 'Addresses',
  robots: { index: false, follow: false },
};

export default function AddressesPage() {
  return <AddressesManager />;
}
