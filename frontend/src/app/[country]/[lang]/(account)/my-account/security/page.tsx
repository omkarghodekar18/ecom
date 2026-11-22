import type { Metadata } from 'next';
import { SecurityPanel } from '@/features/auth/ui/security-panel';

export const metadata: Metadata = {
  title: 'Security',
  robots: { index: false, follow: false },
};

export default function SecurityPage() {
  return <SecurityPanel />;
}
