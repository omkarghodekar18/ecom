// Sitemap feed reads (spec Section 13): the backend streams chunked URL sets
// (max 45,000 URLs per chunk) from GET /seo/sitemap/*; these helpers consume
// them server-side. Every read is ISR-cached (1 h, tag `sitemap`) and NEVER
// throws — a missing backend at build/render time degrades to an empty feed
// instead of failing the route (the chunk is simply regenerated later).
import { apiFetch } from '@/lib/api-client';
import type { SitemapChunkDto, SitemapIndexDto } from '@/shared/dto/seo.dto';

const SITEMAP_REVALIDATE = { revalidate: 3600, tags: ['sitemap'] };

/** Chunk streams that exist + their page counts; null when unreachable. */
export async function fetchSitemapIndex(): Promise<SitemapIndexDto | null> {
  try {
    const { data } = await apiFetch<SitemapIndexDto>('/seo/sitemap/index', {
      next: SITEMAP_REVALIDATE,
    });
    return data;
  } catch {
    return null;
  }
}

/** One 1-based chunk page of one stream; null when unreachable/out of range. */
export async function fetchSitemapChunk(type: string, page: number): Promise<SitemapChunkDto | null> {
  try {
    const { data } = await apiFetch<SitemapChunkDto>(`/seo/sitemap/${type}/${page}`, {
      next: SITEMAP_REVALIDATE,
    });
    return data;
  } catch {
    return null;
  }
}
