import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/features/auth/ui/forgot-password-form';

export const metadata: Metadata = {
  title: 'Reset password',
  robots: { index: false, follow: false },
};

type ForgotPasswordPageProps = {
  params: Promise<{ country: string; lang: string }>;
};

export default async function ForgotPasswordPage({ params }: ForgotPasswordPageProps) {
  const { country, lang } = await params;
  return <ForgotPasswordForm locale={`/${country}/${lang}`} />;
}
