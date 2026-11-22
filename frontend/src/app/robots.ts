// robots.txt (spec Section 13): the whole storefront is crawlable except the
// user-generated search URL space, the API proxy and the account/auth areas
// (all additionally noindex at the page level). Sitemap lines list EVERY
// sitemap chunk file — Next serves them at /sitemap/<id>.xml (see sitemap.ts),
// there is no single /sitemap.xml index. ISR: regenerated hourly.
import type { MetadataRoute } from 'next';
import { site } from '@/config/site';
import { fetchSitemapIndex } from '@/lib/seo/sitemap-api';

export const revalidate = 3600;

/** Account/auth/search paths to keep out of the crawl budget (only-`in/en` today). */
const DISALLOWED = [
  '/api/',
  '/in/en/search',
  '/in/en/my-account',
  '/in/en/my-company',
  '/in/en/login',
  '/in/en/register',
  '/in/en/forgot-password',
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const index = await fetchSitemapIndex();
  const chunkIds = ['static'];
  for (const stream of index?.types ?? []) {
    for (let page = 1; page <= stream.totalPages; page += 1) {
      chunkIds.push(`${stream.type}-${page}`);
    }
  }
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: DISALLOWED }],
    sitemap: chunkIds.map((id) => `${site.url}/sitemap/${id}.xml`),
  };
}
