// Account-area layout (spec 6.9): server component (noindex metadata) that
// renders the client shell with the sidebar navigation and guest guard.
import type { Metadata } from 'next';
import { AccountShell } from '@/features/auth/ui/account-shell';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ country: string; lang: string }>;
}) {
  const { country, lang } = await params;
  return <AccountShell locale={`/${country}/${lang}`}>{children}</AccountShell>;
}
