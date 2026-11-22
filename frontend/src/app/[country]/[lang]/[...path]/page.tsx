// Category page (spec 6.2/6.3): breadcrumb → H1 → subcategory tiles (non-leaf)
// → Filter & Sort bar → listing (list/tile) with URL-driven filter state.
// The slug path is cosmetic: mismatching paths 301 to the canonical URL; the
// category code is the lookup key (spec Section 7).
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import { ApiError } from '@/lib/api-client';
import { routes } from '@/config/routes';
import { site as siteConfig } from '@/config/site';
import { Breadcrumbs } from '@/components/seo/breadcrumbs';
import { JsonLd } from '@/components/seo/json-ld';
import {
  getBreadcrumb,
  getBrands,
  getCategory,
  getFilterDefs,
  getListing,
  isNotFoundError,
} from '@/features/product/api';
import { CategoryListing } from '@/features/product/category-listing';
import { CategoryTileGrid } from '@/features/product/category-tile-grid';
import { buildCategoryMetadata, buildItemListJsonLd, categoryCrumbItems } from '@/features/product/seo';
import { parseViewCookie } from '@/features/product/view';
import { parseFilterParams } from '@/lib/filter-url';
import type { CategoryDto, CrumbDto } from '@/shared/dto/catalog.dto';

export const revalidate = 600;

type PageProps = {
  params: Promise<{ country: string; lang: string; path: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Splits a catch-all path into {slugPath, code}; null when not `…/c/{code}`. */
function parseCategoryPath(path: string[]): { slugPath: string[]; code: string } | null {
  if (path.length < 2) return null;
  const code = path[path.length - 1] ?? '';
  const marker = path[path.length - 2] ?? '';
  if (marker !== 'c' || !/^\d{2}(?:-\d{2}){4}$/.test(code)) return null;
  return { slugPath: path.slice(0, -2), code };
}

async function loadCategory(code: string) {
  try {
    return await getCategory(code);
  } catch (err) {
    if (isNotFoundError(err)) notFound();
    throw err;
  }
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { country, lang, path } = await params;
  const parsed = parseCategoryPath(path);
  if (!parsed) notFound();
  const category = await loadCategory(parsed.code);
  const state = parseFilterParams(
    new URLSearchParams(asTuples(await searchParams)),
    await getFilterDefs(parsed.code),
  );
  return buildCategoryMetadata({ category, locale: `/${country}/${lang}`, state });
}

/** Flattens Next's searchParams into URLSearchParams tuples. */
function asTuples(sp: Record<string, string | string[] | undefined>): [string, string][] {
  const out: [string, string][] = [];
  for (const [key, value] of Object.entries(sp)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => out.push([key, v]));
    else out.push([key, value]);
  }
  return out;
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { country, lang, path } = await params;
  const parsed = parseCategoryPath(path);
  if (!parsed) notFound();
  const { slugPath, code } = parsed;
  const locale = `/${country}/${lang}`;
  const r = routes(locale);

  const category = await loadCategory(code);

  // Canonical slug path: the code is authoritative; wrong paths redirect 301.
  const incomingPath = slugPath.join('/');
  if (incomingPath !== category.pathSlugs) {
    permanentRedirect(r.category(category.pathSlugs, code));
  }

  // Parse once; the listing fetch reuses the same state (no double parsing).
  const state = parseFilterParams(
    new URLSearchParams(asTuples(await searchParams)),
    await getFilterDefs(code),
  );

  const [crumbs, defs, brands, listingResult, cookieStore] = await Promise.all([
    getBreadcrumb(code),
    getFilterDefs(code),
    getBrands(),
    getListing(code, state),
    cookies(),
  ]);
  const view = parseViewCookie(cookieStore.get('th:view')?.value);
  const categoryHref = r.category(category.pathSlugs, code);
  const children = (category as CategoryDto & { children?: CategoryDto[] }).children ?? [];
  const isLeaf = children.length === 0;

  const breadcrumbItems = categoryCrumbItems(crumbs as CrumbDto[], locale);

  return (
    <div className="page-container py-4 lg:py-6">
      <Breadcrumbs items={breadcrumbItems} />

      <h1 className="h1-page mt-4">{category.name}</h1>

      {!isLeaf && (
        <section aria-labelledby="subcategories-heading" className="mt-6">
          <h2 id="subcategories-heading" className="text-lg font-bold">
            Categories
          </h2>
          <div className="mt-3">
            <CategoryTileGrid categories={children} locale={locale} />
          </div>
        </section>
      )}

      <CategoryListing
        categoryCode={code}
        defs={defs}
        brands={brands}
        state={state}
        listing={listingResult.listing}
        totalPages={listingResult.totalPages}
        view={view}
        locale={locale}
        clearHref={categoryHref}
        categoryHref={categoryHref}
      />

      {category.description && (
        <p className="mt-10 max-w-3xl text-sm text-muted">{category.description}</p>
      )}

      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: breadcrumbItems.map((item, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: item.name,
              ...(item.href ? { item: new URL(item.href, siteConfig.url).toString() } : {}),
            })),
          },
          buildItemListJsonLd(listingResult.listing.items, locale),
        ]}
      />
    </div>
  );
}
