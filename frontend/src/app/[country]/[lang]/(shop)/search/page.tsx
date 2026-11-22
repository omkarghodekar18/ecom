// Search results page (spec 6.5/12): header search box submits here with
// ?q=…; the URL carries the full listing filter state (brand/inStock/sort/
// attributes) so filtered searches stay shareable and server-rendered.
// Result pages are noindex (user-generated URLs) but followed.
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Breadcrumbs } from '@/components/seo/breadcrumbs';
import { JsonLd } from '@/components/seo/json-ld';
import { site as siteConfig } from '@/config/site';
import { parseViewCookie } from '@/features/product/view';
import { getBrands } from '@/features/product/api';
import { getSearchFilterDefs, getSearchListing } from '@/features/search/search-api';
import { SearchListing } from '@/features/search/search-listing';
import { parseFilterParams, recordToSearchParams } from '@/lib/filter-url';
import { buildBreadcrumbJsonLd } from '@/components/seo/breadcrumbs';

type PageProps = {
  params: Promise<{ country: string; lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** q contract of GET /search (shared SearchQSchema): trimmed, 2–100 chars. */
const Q_MIN = 2;
const Q_MAX = 100;

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { country, lang } = await params;
  const sp = recordToSearchParams(await searchParams);
  const q = (sp.get('q') ?? '').trim();
  const valid = q.length >= Q_MIN && q.length <= Q_MAX;
  return {
    title: valid ? `Search: ${q} — ${siteConfig.name}` : `Search — ${siteConfig.name}`,
    robots: { index: false, follow: true },
    alternates: { canonical: `/${country}/${lang}/search` },
  };
}

export default async function SearchPage({ params, searchParams }: PageProps) {
  const { country, lang } = await params;
  const locale = `/${country}/${lang}`;
  const sp = recordToSearchParams(await searchParams);
  const q = (sp.get('q') ?? '').trim();
  const valid = q.length >= Q_MIN && q.length <= Q_MAX;

  const defs = await getSearchFilterDefs();
  const state = parseFilterParams(sp, defs);

  // Breadcrumbs: Home → Search (the term itself is the H1).
  const breadcrumbItems = [
    { name: 'Home', href: locale },
    { name: 'Search' },
  ];

  return (
    <div className="page-container py-4 lg:py-6">
      <Breadcrumbs items={breadcrumbItems} />

      <h1 className="h1-page mt-4">
        {valid ? (
          <>
            Search results for <span className="text-brand">&ldquo;{q}&rdquo;</span>
          </>
        ) : (
          'Search'
        )}
      </h1>

      {valid ? (
        <SearchResults q={q} state={state} defs={defs} locale={locale} />
      ) : (
        <p className="mt-6 max-w-2xl text-sm text-muted">
          Enter a search term of {Q_MIN}–{Q_MAX} characters in the search box above — a product
          name, brand, category, article number or EAN.
        </p>
      )}

      <JsonLd
        data={[
          buildBreadcrumbJsonLd(breadcrumbItems),
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: siteConfig.name,
            url: siteConfig.url,
            potentialAction: {
              '@type': 'SearchAction',
              target: `${siteConfig.url}${locale}/search?q={search_term_string}`,
              'query-input': 'required name=search_term_string',
            },
          },
        ]}
      />
    </div>
  );
}

/** Loads the results page (deferred so the invalid-q branch fetches nothing). */
async function SearchResults({
  q,
  state,
  defs,
  locale,
}: {
  q: string;
  state: ReturnType<typeof parseFilterParams>;
  defs: Awaited<ReturnType<typeof getSearchFilterDefs>>;
  locale: string;
}) {
  const [{ listing, totalPages }, brands, cookieStore] = await Promise.all([
    getSearchListing({ ...state, q }),
    getBrands(),
    cookies(),
  ]);
  const view = parseViewCookie(cookieStore.get('th:view')?.value);

  return (
    <SearchListing
      q={q}
      defs={defs}
      brands={brands}
      state={{ ...state, q }}
      listing={listing}
      totalPages={totalPages}
      view={view}
      locale={locale}
    />
  );
}
