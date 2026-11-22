import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth/ui/login-form';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

type LoginPageProps = {
  params: Promise<{ country: string; lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const [{ country, lang }, query] = await Promise.all([params, searchParams]);
  const raw = query.redirect;
  const redirect = Array.isArray(raw) ? raw[0] : raw;
  return <LoginForm locale={`/${country}/${lang}`} redirect={redirect} />;
}
