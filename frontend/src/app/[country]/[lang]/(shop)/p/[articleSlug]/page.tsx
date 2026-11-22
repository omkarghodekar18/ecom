// Product detail page (spec 6.4, route spec 7): `/p/{articleSlug}` where the
// param is `{productSlug}-{firstArticleNo}`. The product slug itself contains
// hyphens, so the param is resolved by probing candidate prefixes against the
// API (see features/product-detail/slug). ISR: 1h + `product:{slug}` tags
// (spec 13.9); live price/stock for logged-in users is fetched client-side.
// Variant URLs (?variant=…) canonicalise to the product URL (spec 13.3).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumbs, type CrumbItem } from '@/components/seo/breadcrumbs';
import { JsonLd } from '@/components/seo/json-ld';
import { brand as brandConfig } from '@/config/brand';
import { routes } from '@/config/routes';
import { isLocaleActive, locales, site } from '@/config/site';
import { getFilterDefs } from '@/features/product/api';
import { mediaUrl } from '@/features/cms/media-url';
import { getRelatedProducts, resolveProductByArticleSlug } from '@/features/product-detail/api';
import { ProductDetailClient } from '@/features/product-detail/product-detail-client';
import { productJsonLd } from '@/lib/seo/jsonld';

export const revalidate = 3600;

type SearchParams = Record<string, string | string[] | undefined>;

type PdpPageProps = {
  params: Promise<{ country: string; lang: string; articleSlug: string }>;
  searchParams: Promise<SearchParams>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Meta description target: 150–160 chars (spec 13.2). */
function clampDescription(text: string): string {
  if (text.length <= 160) return text;
  return `${text.slice(0, 157).trimEnd()}…`;
}

export async function generateMetadata({ params }: PdpPageProps): Promise<Metadata> {
  const { country, lang, articleSlug } = await params;
  const resolved = await resolveProductByArticleSlug(articleSlug);
  if (!resolved) {
    return { title: 'Product not found', robots: { index: false, follow: false } };
  }
  const { product } = resolved;
  const locale = `/${country}/${lang}`;

  // Spec 13.3: variant URLs canonicalise to the product URL.
  const canonicalPath = routes(locale).product(product.slug, product.variants[0]?.articleNo ?? '');
  const canonical = new URL(canonicalPath, site.url).toString();
  const title =
    product.seoTitle ?? `${product.name} | ${product.category.name} | ${product.brand.name}`;
  const description = clampDescription(
    product.seoDescription ?? product.shortDescription ?? `${product.name} at ${brandConfig.name}.`,
  );
  const firstImage = product.images[0] ? mediaUrl(product.images[0].url) : null;

  const languages = Object.fromEntries(
    locales().map((l) => [
      l.hreflang,
      new URL(
        routes(`/${l.country}/${l.lang}`).product(product.slug, product.variants[0]?.articleNo ?? ''),
        site.url,
      ).toString(),
    ]),
  );
  languages['x-default'] = canonical;

  return {
    metadataBase: new URL(site.url),
    // seoTitle overrides are admin-authored full titles (often already
    // branded) — render them verbatim; generated titles use the template.
    ...(product.seoTitle
      ? { title: { absolute: product.seoTitle } }
      : { title: `${product.name} | ${product.category.name} | ${product.brand.name}` }),
    description,
    alternates: { canonical, languages },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: brandConfig.name,
      title,
      description,
      ...(firstImage ? { images: [{ url: firstImage, alt: product.images[0]?.alt ?? product.name }] } : {}),
    },
  };
}

export default async function ProductDetailPage({ params, searchParams }: PdpPageProps) {
  const { country, lang, articleSlug } = await params;
  if (!isLocaleActive(country, lang)) notFound();
  const locale = `/${country}/${lang}`;
  const r = routes(locale);

  const resolved = await resolveProductByArticleSlug(articleSlug);
  if (!resolved) notFound();
  const { product, variantSlug } = resolved;

  // ?variant= (explicit) wins over the article tail baked into the slug.
  const queryVariant = firstValue((await searchParams).variant);
  const initialVariantSlug = queryVariant ?? variantSlug ?? null;

  const [related, defs] = await Promise.all([
    getRelatedProducts(product.slug),
    getFilterDefs(product.category.code),
  ]);

  // Breadcrumbs: Home → full category path → product (spec 6.4).
  const crumbItems: CrumbItem[] = [
    { name: 'Home', href: r.home },
    ...product.category.path.map((crumb) => ({
      name: crumb.name,
      href: r.category(crumb.pathSlugs, crumb.code),
    })),
    { name: product.name },
  ];

  // JSON-LD Product + Offer from the DEFAULT variant (spec 13.4); the
  // BreadcrumbList graph is emitted by the Breadcrumbs component itself.
  const defaultVariant = product.variants[0];
  const canonicalPath = r.product(product.slug, defaultVariant?.articleNo ?? '');

  return (
    <>
      <div className="page-container pt-4 lg:pt-6">
        <Breadcrumbs items={crumbItems} />
      </div>
      <ProductDetailClient
        key={product.id}
        product={product}
        related={related}
        defs={defs}
        locale={locale}
        initialVariantSlug={initialVariantSlug}
      />
      <JsonLd
        id="jsonld-product"
        data={productJsonLd({
          name: product.name,
          sku: defaultVariant?.articleNo ?? product.slug,
          gtin13: defaultVariant?.ean ?? null,
          description: product.shortDescription,
          image: product.images[0]?.url ?? null,
          brandName: product.brand.name,
          price: defaultVariant?.listPrice ?? null,
          availability: defaultVariant?.availability.tone ?? null,
          url: canonicalPath,
        })}
      />
    </>
  );
}
