// Storefront shell (spec 5): sticky two-bar header, main content, footer,
// cookie consent banner and a skip-to-content link. Auth/account routes live
// in their own route groups and are intentionally outside this shell.
import { CookieConsent } from '@/components/layout/cookie-consent';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ country: string; lang: string }>;
}) {
  const { country, lang } = await params;
  const locale = `/${country}/${lang}`;

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      {/* Off-screen until focused (a11y keyboard shortcut). */}
      <a
        href="#main"
        className="absolute -left-[9999px] top-0 z-[70] rounded-btn bg-white px-4 py-2 text-sm font-bold text-brand shadow-lg focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <SiteHeader locale={locale} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter locale={locale} />
      <CookieConsent locale={locale} />
    </div>
  );
}
