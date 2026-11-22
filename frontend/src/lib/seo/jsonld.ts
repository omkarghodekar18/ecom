// JSON-LD graph builders (spec 13.4). Pure data-in/data-out — no React — so
// they can be unit-tested and reused anywhere. The BreadcrumbList builder
// lives in `components/seo/breadcrumbs.tsx` (reuse that one).

import { brand } from '@/config/brand';
import { site } from '@/config/site';

/** Absolutises a path (/in/en/… or /media/…) against the public site URL. */
export function absoluteUrl(path: string): string {
  if (/^[a-z]+:\/\//i.test(path) || path.startsWith('//')) return path;
  try {
    return new URL(path, site.url).toString();
  } catch {
    return path;
  }
}

/** Default locale base, e.g. "/in/en" — used for the WebSite SearchAction. */
export function defaultLocaleBase(): string {
  const country = site.countries[0];
  return `/${country?.code ?? site.defaultCountry}/${country?.defaultLanguage ?? 'en'}`;
}

/** Organization node: identity, contact point and address from brand config. */
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: brand.name,
    legalName: brand.legalName,
    url: site.url,
    description: `${brand.name} — ${brand.tagline}. B2B supplier of industrial tools in India.`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: brand.contact.address,
      addressCountry: 'IN',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      telephone: brand.contact.phone,
      email: brand.contact.email,
      availableLanguage: ['en'],
    },
  };
}

/**
 * WebSite node incl. SearchAction (spec 13.4). `siteUrl` should be the
 * canonical origin, e.g. `site.url`.
 */
export function webSiteJsonLd(siteUrl: string = site.url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: brand.name,
    url: siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl}${defaultLocaleBase()}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** ItemList node for listing pages (brand/category/search results). */
export function itemListJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.url),
    })),
  };
}

/** Stock tone → schema.org offer availability. */
const AVAILABILITY_MAP = {
  green: 'https://schema.org/InStock',
  amber: 'https://schema.org/PreOrder',
  red: 'https://schema.org/OutOfStock',
} as const;

/** Product + Offer node input — assembled by the PDP (name, sku, price, …). */
export interface ProductJsonLdInput {
  name: string;
  /** Article number of the selected variant. */
  sku: string;
  gtin13?: string | null;
  description?: string | null;
  /** Any image URL (path or absolute). */
  image?: string | null;
  brandName: string;
  /** Decimal string, e.g. "2302.30". Omitting the offer hides `offers`. */
  price?: string | null;
  availability?: keyof typeof AVAILABILITY_MAP | null;
  /** Canonical PDP URL. */
  url: string;
}

/** Product + Offer node (spec 13.4): INR, availability, sku, gtin13, brand. */
export function productJsonLd(product: ProductJsonLdInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description ?? undefined,
    sku: product.sku,
    ...(product.gtin13 ? { gtin13: product.gtin13 } : {}),
    ...(product.image ? { image: absoluteUrl(product.image) } : {}),
    brand: { '@type': 'Brand', name: product.brandName },
    ...(product.price
      ? {
          offers: {
            '@type': 'Offer',
            price: product.price,
            priceCurrency: 'INR',
            availability: AVAILABILITY_MAP[product.availability ?? 'green'],
            url: absoluteUrl(product.url),
          },
        }
      : {}),
  };
}
