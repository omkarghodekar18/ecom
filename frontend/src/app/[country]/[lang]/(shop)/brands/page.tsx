// Brands index (spec 6.12): alphabetical A–Z sections with anchor quick-jump
// links, brand cards (logo/initial tile, premium badge, product count) linking
// to the brand pages. Indexable (spec 13.1); ISR revalidate 10 min, tag `brands`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/seo/breadcrumbs';
import { Badge } from '@/components/ui';
import { brand as brandConfig } from '@/config/brand';
import { routes } from '@/config/routes';
import { isLocaleActive, locales, site } from '@/config/site';
import { fetchBrands, type BrandWithCount } from '@/features/product/brands-api';
import { cn } from '@/lib/cn';

export const revalidate = 600;

type BrandsPageProps = {
  params: Promise<{ country: string; lang: string }>;
};

/** First letter of the brand name; anything non-A–Z buckets into "#". */
function groupKey(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

/** Brands grouped A–Z (name-sorted input from the API). */
function groupBrands(brands: BrandWithCount[]): { letter: string; brands: BrandWithCount[] }[] {
  const groups = new Map<string, BrandWithCount[]>();
  for (const b of [...brands].sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const key = groupKey(b.name);
    const bucket = groups.get(key);
    if (bucket) bucket.push(b);
    else groups.set(key, [b]);
  }
  const LETTER_ORDER = (x: string, y: string) => (x === '#' ? 1 : y === '#' ? -1 : x.localeCompare(y, 'en'));
  return [...groups.entries()].sort(([a], [b]) => LETTER_ORDER(a, b)).map(([letter, list]) => ({ letter, brands: list }));
}

export async function generateMetadata({ params }: BrandsPageProps): Promise<Metadata> {
  const { country, lang } = await params;
  const locale = `/${country}/${lang}`;
  const canonical = `${site.url}${locale}/brands`;
  const languages = Object.fromEntries(
    locales().map((l) => [l.hreflang, `${site.url}/${l.country}/${l.lang}/brands`]),
  );
  languages['x-default'] = canonical;

  return {
    metadataBase: new URL(site.url),
    title: 'Our brands',
    description: `All brands at ${brandConfig.name}: premium and quality tooling brands with live product counts — cutting tools, measuring equipment, clamping, hand tools and more.`,
    alternates: { canonical, languages },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: brandConfig.name,
      title: `Our brands | ${brandConfig.name}`,
      description: 'Premium and quality tooling brands with live product counts.',
    },
  };
}

function BrandCard({ brand, href }: { brand: BrandWithCount; href: string }) {
  return (
    <Link
      href={href}
      className="flex h-full flex-col gap-2 rounded-tile border border-line bg-white p-4 transition-colors hover:border-brand"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-btn text-lg font-bold',
            brand.isPremium ? 'bg-navy text-white' : 'bg-tile text-ink',
          )}
        >
          {brand.name.charAt(0).toUpperCase()}
        </span>
        <h3 className="min-w-0 truncate font-bold text-ink">{brand.name}</h3>
        {brand.isPremium ? <Badge variant="brand">Premium</Badge> : null}
      </div>
      {brand.description ? (
        <p className="line-clamp-2 text-sm leading-6 text-muted">{brand.description}</p>
      ) : null}
      <p className="mt-auto text-sm text-muted">
        <span className="font-bold text-ink">{brand.productCount}</span> products
      </p>
    </Link>
  );
}

export default async function BrandsPage({ params }: BrandsPageProps) {
  const { country, lang } = await params;
  if (!isLocaleActive(country, lang)) return null;
  const locale = `/${country}/${lang}`;
  const r = routes(locale);

  const brands = await fetchBrands();
  const groups = groupBrands(brands);

  return (
    <div className="page-container py-6 lg:py-10">
      <Breadcrumbs items={[{ name: 'Home', href: locale }, { name: 'Brands' }]} />
      <h1 className="h1-page mt-4">Our brands</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        {brands.length} tooling brands — from premium cutting tools with batch traceability to
        made-in-India quality brands, all with live stock and net prices.
      </p>

      {/* A–Z quick jump. */}
      <nav aria-label="Brands by letter" className="mt-6">
        <ul className="flex flex-wrap gap-1.5">
          {groups.map((group) => (
            <li key={group.letter}>
              <a
                href={`#letter-${group.letter}`}
                className="flex h-9 w-9 items-center justify-center rounded-btn border border-line bg-white text-sm font-bold text-ink transition-colors hover:border-brand hover:text-brand"
              >
                {group.letter}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {groups.map((group) => (
        <section key={group.letter} aria-labelledby={`letter-${group.letter}-title`} className="mt-10 scroll-mt-32">
          <h2 id={`letter-${group.letter}-title`} className="text-lg font-bold text-ink">
            {group.letter}
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.brands.map((b) => (
              <li key={b.slug} className="flex">
                <BrandCard brand={b} href={r.brand(b.slug)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
