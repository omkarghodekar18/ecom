// Server-side CMS fetchers (home composition + block pages) with ISR caching
// (spec 6.1.4: revalidate 10 min, on-demand revalidation via the `home` /
// `cms:{slug}` tags). Client components never import this file.
import { ApiError, apiFetch } from '@/lib/api-client';
import { CmsPageSchema, HomeDtoSchema, type CmsPageDto, type HomeDto } from './cms.dto';

const REVALIDATE_SECONDS = 600;

/** GET /cms/home — heroes, side teasers, highlights, category tiles, SEO copy. */
export async function fetchHome(): Promise<HomeDto> {
  const res = await apiFetch<unknown>('/cms/home', {
    next: { revalidate: REVALIDATE_SECONDS, tags: ['home'] },
  });
  return HomeDtoSchema.parse(res.data);
}

/**
 * GET /cms/pages/:slug — returns null (→ notFound()) when the API answers 404;
 * other failures propagate to the route error boundary.
 */
export async function fetchCmsPage(slug: string): Promise<CmsPageDto | null> {
  try {
    const res = await apiFetch<unknown>(`/cms/pages/${encodeURIComponent(slug)}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: [`cms:${slug}`] },
    });
    return CmsPageSchema.parse(res.data);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
