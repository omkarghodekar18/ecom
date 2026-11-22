// SEO helpers for category/listing pages (spec 13): title template,
// auto-generated 150–160 char description, canonicalisation (filtered URLs
// canonicalise to the clean category URL + noindex,follow; paginated URLs
// stay self-canonical), OpenGraph basics and the ItemList JSON-LD.
import type { Metadata } from 'next';
import { brand as brandConfig } from '@/config/brand';
import { routes } from '@/config/routes';
import { site } from '@/config/site';
import {
  DEFAULT_SORT,
  buildQueryString,
  isFiltered,
  type FilterState,
} from '@/lib/filter-url';
import type { CategoryDto, CrumbDto } from '@/shared/dto/catalog.dto';
import type { ListingProductDto } from '@/shared/dto/product.dto';
import type { CrumbItem } from '@/components/seo/breadcrumbs';

/** Auto description with the 150–160 chars target from spec 13.2. */
function generatedDescription(category: CategoryDto): string {
  const base =
    `${category.name} — ${category.productCount} products from leading industrial brands. ` +
    `Filter by brand, dimensions and availability. Prices excl. GST, fast pan-India delivery at ${brandConfig.name}.`;
  return base.length > 160 ? `${base.slice(0, 157)}\u2026` : base;
}

export interface BuildCategoryMetadataArgs {
  category: CategoryDto;
  locale: string;
  state: FilterState;
}

export function buildCategoryMetadata({ category, locale, state }: BuildCategoryMetadataArgs): Metadata {
  const canonicalUrl = new URL(
    routes(locale).category(category.pathSlugs, category.code),
    site.url,
  ).toString();

  const title = category.seoTitle ?? `${category.name} | ${brandConfig.name}`;
  const description = category.seoDescription ?? generatedDescription(category);
  const filtered = isFiltered(state);

  // Filtered listing → canonical to the clean category URL + noindex,follow.
  // Unfiltered → self-canonical (pagination query kept, spec 13.3).
  let canonical = canonicalUrl;
  if (!filtered) {
    const paginationOnly = buildQueryString({
      ...state,
      brand: [],
      inStock: false,
      sort: DEFAULT_SORT,
      attrs: {},
    });
    if (paginationOnly) canonical = `${canonicalUrl}?${paginationOnly}`;
  }

  return {
    title,
    description,
    alternates: { canonical },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: brandConfig.name,
      type: 'website',
    },
  };
}

/** Homepage + category path; the last crumb is the current page (no link). */
export function categoryCrumbItems(crumbs: CrumbDto[], locale: string): CrumbItem[] {
  const r = routes(locale);
  const items: CrumbItem[] = [{ name: 'Homepage', href: r.home }];
  crumbs.forEach((crumb, index) => {
    const isLast = index === crumbs.length - 1;
    items.push(
      isLast
        ? { name: crumb.name }
        : { name: crumb.name, href: r.category(crumb.pathSlugs, crumb.code) },
    );
  });
  return items;
}

/** ItemList JSON-LD for the first listing page (spec 13.4). */
export function buildItemListJsonLd(items: ListingProductDto[], locale: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: new URL(routes(locale).product(item.slug, item.firstArticleNo), site.url).toString(),
      name: item.name,
    })),
  };
}
