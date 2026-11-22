import { notFound } from 'next/navigation';
import { isLocaleActive, site } from '@/config/site';

/** Validates the /{country}/{lang} segment; unknown locales 404. */
export function generateStaticParams() {
  return site.countries.flatMap((c) => c.languages.map((l) => ({ country: c.code, lang: l })));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ country: string; lang: string }>;
}) {
  const { country, lang } = await params;
  if (!isLocaleActive(country, lang)) notFound();
  return <>{children}</>;
}
