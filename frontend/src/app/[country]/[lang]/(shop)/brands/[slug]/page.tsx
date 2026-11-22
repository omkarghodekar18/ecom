// Brand detail (spec 6.12): brand header (logo/initial tile, name, premium
// badge, description) + the product listing grid (24 per page, numbered
// pagination) + ItemList JSON-LD. Indexable (spec 13.1); sorted views are
// noindex,follow with a canonical to the bare brand URL, paginated views are
// self-canonical (spec 13.3).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/seo/breadcrumbs';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge, EmptyState } from '@/components/ui';
import { brand as brandConfig } from '@/config/brand';
import { routes } from '@/config/routes';
import { isLocaleActive, locales, site } from '@/config/site';
import { fetchBrand, fetchBrandProducts } from '@/features/product/brands-api';
import { ListingGrid } from '@/features/product/listing-grid';
import { ListingPagination } from '@/features/product/listing-pagination';
import { itemListJsonLd } from '@/lib/seo/jsonld';
import { SortSchema, type Sort } from '@/shared/dto/product.dto';

export const revalidate = 600;

const PAGE_SIZE = 24;
const DEFAULT_SORT: Sort = 'relevance';

type SearchParams = Record<string, string | string[] | undefined>;

type BrandDetailPageProps = {
  params: Promise<{ country: string; lang: string; slug: string }>;
  searchParams: Promise<SearchParams>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(query: SearchParams): number {
  const parsed = Number.parseInt(firstValue(query.page) ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseSort(query: SearchParams): Sort {
  const parsed = SortSchema.safeParse(firstValue(query.sort));
  return parsed.success ? parsed.data : DEFAULT_SORT;
}

export async function generateMetadata({ params, searchParams }: BrandDetailPageProps): Promise<Metadata> {
  const [{ country, lang, slug }, query] = await Promise.all([params, searchParams]);
  const locale = `/${country}/${lang}`;
  const brand = await fetchBrand(slug);

  if (!brand) {
    return { title: 'Brand not found', robots: { index: false, follow: false } };
  }

  // Spec 13.3: sorted views → canonical to the bare brand URL + noindex,follow;
  // paginated views self-canonical; page 1 canonicalises to the bare URL.
  const page = parsePage(query);
  const isSorted = parseSort(query) !== DEFAULT_SORT;
  const basePath = `${site.url}${locale}/brands/${brand.slug}`;
  const canonical = isSorted || page <= 1 ? basePath : `${basePath}?page=${page}`;

  const languages = Object.fromEntries(
    locales().map((l) => [l.hreflang, `${site.url}/${l.country}/${l.lang}/brands/${brand.slug}`]),
  );
  languages['x-default'] = basePath;

  return {
    metadataBase: new URL(site.url),
    title: `${brand.name} — tools & products`,
    description:
      brand.description ??
      `${brand.name} tools at ${brandConfig.name} — live stock, transparent net prices and fast delivery across India.`,
    alternates: { canonical, languages },
    ...(isSorted ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: brandConfig.name,
      title: `${brand.name} | ${brandConfig.name}`,
      description: brand.description ?? undefined,
    },
  };
}

export default async function BrandDetailPage({ params, searchParams }: BrandDetailPageProps) {
  const [{ country, lang, slug }, query] = await Promise.all([params, searchParams]);
  if (!isLocaleActive(country, lang)) notFound();
  const locale = `/${country}/${lang}`;
  const r = routes(locale);

  const brand = await fetchBrand(slug);
  if (!brand) notFound();

  const page = parsePage(query);
  const sort = parseSort(query);
  const { listing, meta } = await fetchBrandProducts(brand.slug, {
    page,
    pageSize: PAGE_SIZE,
    sort,
  });
  const totalPages = meta?.totalPages ?? Math.ceil(listing.total / PAGE_SIZE);
  const basePath = r.brand(brand.slug);

  return (
    <div className="page-container py-6 lg:py-10">
      <Breadcrumbs
        items={[
          { name: 'Home', href: locale },
          { name: 'Brands', href: r.brands },
          { name: brand.name },
        ]}
      />

      <header className="mt-4 flex flex-wrap items-start gap-4">
        <span
          aria-hidden="true"
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-btn text-xl font-bold ${
            brand.isPremium ? 'bg-navy text-white' : 'bg-tile text-ink'
          }`}
        >
          {brand.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="h1-page">{brand.name}</h1>
            {brand.isPremium ? <Badge variant="brand">Premium</Badge> : null}
          </div>
          {brand.description ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">{brand.description}</p>
          ) : null}
        </div>
      </header>

      <section aria-label={`Products by ${brand.name}`} className="mt-8">
        <h2 className="text-lg font-bold text-ink">
          Products{' '}
          <span className="font-medium text-muted">({listing.total.toLocaleString('en-IN')})</span>
        </h2>

        {listing.items.length > 0 ? (
          <ListingGrid items={listing.items} locale={locale} priorityFirst={page === 1} className="mt-5" />
        ) : (
          <EmptyState
            className="mt-6"
            title="No products in this brand yet"
            description="This brand has no published products — check back soon."
          />
        )}

        <ListingPagination
          page={page}
          totalPages={totalPages}
          basePath={basePath}
          query={sort !== DEFAULT_SORT ? { sort } : undefined}
        />
      </section>

      <JsonLd
        data={itemListJsonLd(
          listing.items.map((item) => ({
            name: item.name,
            url: r.product(item.slug, item.firstArticleNo),
          })),
        )}
        id="jsonld-brand-itemlist"
      />
    </div>
  );
}
