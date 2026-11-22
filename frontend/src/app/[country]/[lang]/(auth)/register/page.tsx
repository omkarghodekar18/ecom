import type { Metadata } from 'next';
import { RegisterForm } from '@/features/auth/ui/register-form';

export const metadata: Metadata = {
  title: 'Create account',
  robots: { index: false, follow: false },
};

type RegisterPageProps = {
  params: Promise<{ country: string; lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RegisterPage({ params, searchParams }: RegisterPageProps) {
  const [{ country, lang }, query] = await Promise.all([params, searchParams]);
  const raw = query.redirect;
  const redirect = Array.isArray(raw) ? raw[0] : raw;
  return <RegisterForm locale={`/${country}/${lang}`} redirect={redirect} />;
}
