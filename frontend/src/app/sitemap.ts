// Sitemap (spec Section 13): one Next sitemap file per backend chunk stream
// (categories/products/brands/cms, max 45,000 URLs each) plus a small static
// chunk (home, brands overview). Served at /sitemap/<id>.xml; robots.ts lists
// every chunk. ISR: regenerated hourly, so catalog changes flow in without a
// rebuild. When the backend is unreachable the route renders the static chunk
// only (never a build/runtime failure).
import type { MetadataRoute } from 'next';
import { site } from '@/config/site';
import { fetchSitemapChunk, fetchSitemapIndex } from '@/lib/seo/sitemap-api';

export const revalidate = 3600;

/** Stream ids the backend defines (kept local: the feed is the source of truth). */
const STREAMS = ['categories', 'products', 'brands', 'cms'] as const;
type Stream = (typeof STREAMS)[number];

function isStream(value: string): value is Stream {
  return (STREAMS as readonly string[]).includes(value);
}

/** Per-stream crawl hints (spec 13 priorities). */
const HINTS: Record<Stream, { changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }> = {
  categories: { changeFrequency: 'weekly', priority: 0.7 },
  products: { changeFrequency: 'daily', priority: 0.8 },
  brands: { changeFrequency: 'weekly', priority: 0.6 },
  cms: { changeFrequency: 'monthly', priority: 0.5 },
};

/** One chunk file per (stream, 1-based page) + the static entry. */
export async function generateSitemaps(): Promise<Array<{ id: string }>> {
  const index = await fetchSitemapIndex();
  const ids: Array<{ id: string }> = [{ id: 'static' }];
  for (const stream of index?.types ?? []) {
    for (let page = 1; page <= stream.totalPages; page += 1) {
      ids.push({ id: `${stream.type}-${page}` });
    }
  }
  return ids;
}

export default async function sitemap(props: { id?: unknown }): Promise<MetadataRoute.Sitemap> {
  // Next 16 hands route params to metadata routes as Promises (the App Router
  // async-params convention): `id` resolves to the chunk id string. Older
  // shapes (plain string/number, {id}) stay supported defensively.
  let raw: unknown = props?.id;
  if (raw != null && typeof (raw as Promise<unknown>).then === 'function') {
    raw = await raw;
  }
  const id =
    typeof raw === 'string'
      ? raw
      : typeof raw === 'number'
        ? String(raw)
        : raw && typeof raw === 'object' && 'id' in (raw as Record<string, unknown>)
          ? String((raw as { id: unknown }).id)
          : '';

  if (id === 'static') {
    return [
      { url: `${site.url}/in/en`, changeFrequency: 'daily', priority: 1 },
      { url: `${site.url}/in/en/brands`, changeFrequency: 'weekly', priority: 0.8 },
    ];
  }

  const dash = id.lastIndexOf('-');
  const type = id.slice(0, dash);
  const page = Number(id.slice(dash + 1));
  if (!isStream(type) || !Number.isInteger(page) || page < 1) return [];

  const chunk = await fetchSitemapChunk(type, page);
  if (!chunk) return [];
  const hints = HINTS[type];
  return chunk.urls.map((entry) => ({
    url: new URL(entry.loc, site.url).toString(),
    ...(entry.updatedAt ? { lastModified: entry.updatedAt } : {}),
    changeFrequency: hints.changeFrequency,
    priority: hints.priority,
  }));
}
