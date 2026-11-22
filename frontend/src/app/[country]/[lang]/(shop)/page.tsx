// Homepage (spec 6.1): hero grid (slider + side teasers), "Our assortment."
// category tiles, highlights row, brands row, feature band, SEO text and the
// quick-order widget — all composed from GET /cms/home (+ /brands for the
// brand row). ISR: revalidate 10 min + on-demand tag `home`.
import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';
import { brand } from '@/config/brand';
import { routes } from '@/config/routes';
import { isLocaleActive, locales, site } from '@/config/site';
import { fetchHome } from '@/features/cms/cms-api';
import { BannerCard } from '@/features/cms/banner-card';
import { CtaBand } from '@/features/cms/cta-band';
import { HomeBrands } from '@/features/cms/home-brands';
import { HomeHero } from '@/features/cms/home-hero';
import { QuickOrderWidget } from '@/features/cms/quick-order-widget';
import { HomeSeoText } from '@/features/cms/seo-text';
import { CategoryTileGrid } from '@/features/catalog/category-tile-grid';
import { fetchBrands } from '@/features/product/brands-api';
import { absoluteUrl, organizationJsonLd, webSiteJsonLd } from '@/lib/seo/jsonld';

export const revalidate = 600;

type ShopHomePageProps = {
  params: Promise<{ country: string; lang: string }>;
};

function localeBase(country: string, lang: string): string {
  return `/${country}/${lang}`;
}

/** hreflang alternates from the active locales (spec 13.6). */
function languageAlternates(): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of locales()) {
    languages[locale.hreflang] = `${site.url}/${locale.country}/${locale.lang}`;
  }
  languages['x-default'] = `${site.url}/${site.defaultCountry}/${site.countries[0]?.defaultLanguage ?? 'en'}`;
  return languages;
}

export async function generateMetadata({ params }: ShopHomePageProps): Promise<Metadata> {
  const { country, lang } = await params;
  const locale = localeBase(country, lang);
  const home = await fetchHome();

  const title = home.seoTitle || `${brand.name} — tools for professionals`;
  const description = home.seoDescription;
  const canonical = `${site.url}${locale}`;
  const ogImage = home.heroes[0] ? absoluteUrl(home.heroes[0].image) : undefined;

  return {
    metadataBase: new URL(site.url),
    // `absolute` — the homepage title must not inherit the "| ToolHub India" template.
    title: { absolute: title },
    description,
    alternates: {
      canonical,
      languages: languageAlternates(),
    },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: brand.name,
      title,
      description,
      ...(ogImage ? { images: [{ url: ogImage, alt: home.heroes[0]?.heading ?? title }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export default async function ShopHomePage({ params }: ShopHomePageProps) {
  const { country, lang } = await params;
  if (!isLocaleActive(country, lang)) return null;
  const locale = localeBase(country, lang);
  const r = routes(locale);

  const [home, brandList] = await Promise.all([fetchHome(), fetchBrands()]);

  return (
    <>
      {/* One H1 per page (spec 13.8) — the rotating hero headlines are h2s. */}
      <h1 className="sr-only">
        {brand.name} — {brand.tagline}
      </h1>

      <HomeHero heroes={home.heroes} sideTop={home.sideTop} sideBottom={home.sideBottom} />

      <CategoryTileGrid tiles={home.categoryTiles} locale={locale} />

      {home.highlights.length > 0 ? (
        <section aria-labelledby="highlights-title" className="page-container py-10 lg:py-14">
          <h2 id="highlights-title" className="text-xl font-bold text-ink sm:text-2xl">
            Our highlights
          </h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {home.highlights.map((banner) => (
              <li key={`${banner.placement}-${banner.sortOrder}`} className="flex">
                <BannerCard banner={banner} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <HomeBrands locale={locale} brands={brandList} />

      <CtaBand
        heading="Plan your tooling with our engineers"
        subheading="Free application advice — from prototype to series production, we specify, quote and deliver."
        ctaLabel="Get in touch"
        ctaHref={r.contact}
      />

      <HomeSeoText />

      <QuickOrderWidget locale={locale} />

      <JsonLd data={organizationJsonLd()} id="jsonld-organization" />
      <JsonLd data={webSiteJsonLd(site.url)} id="jsonld-website" />
    </>
  );
}
