// CMS content pages (spec 6.11) at /e/[slug]: breadcrumb (Home → title), H1
// and the block-renderer for the six seeded block types. The Breadcrumbs
// component emits the BreadcrumbList JSON-LD. ISR: revalidate 10 min + tag
// `cms:{slug}`; API 404s map to notFound().
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/seo/breadcrumbs';
import { brand } from '@/config/brand';
import { isLocaleActive, site } from '@/config/site';
import { fetchCmsPage } from '@/features/cms/cms-api';
import { BlockRenderer } from '@/features/cms/block-renderer';

export const revalidate = 600;

type CmsPageRouteProps = {
  params: Promise<{ country: string; lang: string; slug: string }>;
};

export async function generateMetadata({ params }: CmsPageRouteProps): Promise<Metadata> {
  const { country, lang, slug } = await params;
  const locale = `/${country}/${lang}`;
  const page = await fetchCmsPage(slug);

  if (!page) {
    return { title: 'Page not found', robots: { index: false, follow: false } };
  }

  const title = page.seoTitle || page.title;
  const description =
    page.seoDescription ||
    `${page.title} — ${brand.name}, tools for professionals.`;
  const canonical = `${site.url}${locale}/e/${page.slug}`;

  return {
    metadataBase: new URL(site.url),
    title,
    description,
    alternates: {
      canonical,
      languages: { 'en-IN': canonical, 'x-default': canonical },
    },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: brand.name,
      title,
      description,
    },
  };
}

export default async function CmsPageRoute({ params }: CmsPageRouteProps) {
  const { country, lang, slug } = await params;
  if (!isLocaleActive(country, lang)) notFound();
  const locale = `/${country}/${lang}`;

  const page = await fetchCmsPage(slug);
  if (!page) notFound();

  return (
    <>
      <div className="page-container pt-4 lg:pt-6">
        <Breadcrumbs items={[{ name: 'Home', href: locale }, { name: page.title }]} />
        <h1 className="h1-page mt-4">{page.title}</h1>
      </div>
      <BlockRenderer blocks={page.blocks} />
    </>
  );
}
