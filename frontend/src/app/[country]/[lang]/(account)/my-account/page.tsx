import type { Metadata } from 'next';
import { AccountOverview } from '@/features/auth/ui/account-overview';

export const metadata: Metadata = {
  title: 'My account',
  robots: { index: false, follow: false },
};

type MyAccountPageProps = {
  params: Promise<{ country: string; lang: string }>;
};

export default async function MyAccountPage({ params }: MyAccountPageProps) {
  const { country, lang } = await params;
  return <AccountOverview locale={`/${country}/${lang}`} />;
}
