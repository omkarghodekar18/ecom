// Minimal centered layout for the auth pages (spec 6.8). Server component so
// the noindex robots policy applies to every child page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { brand } from '@/config/brand';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ country: string; lang: string }>;
}) {
  const { country, lang } = await params;
  const home = `/${country}/${lang}`;

  return (
    <div className="flex min-h-dvh flex-col bg-tile/60">
      <main className="flex flex-1 flex-col items-center px-4 py-10 sm:py-14">
        <Link
          href={home}
          className="inline-flex items-center gap-2 text-lg font-bold text-ink focus-visible:outline-none"
          aria-label={`${brand.name} — homepage`}
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-btn bg-brand text-white"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: brand.logoSvg }}
          />
          {brand.name}
        </Link>
        <div className="mt-8 w-full max-w-md rounded-tile bg-white p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
