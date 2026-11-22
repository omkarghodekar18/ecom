import type { Metadata } from 'next';
import { CompanyPanel } from '@/features/auth/ui/company-panel';

export const metadata: Metadata = {
  title: 'My company',
  robots: { index: false, follow: false },
};

export default function CompanyPage() {
  return <CompanyPanel />;
}
