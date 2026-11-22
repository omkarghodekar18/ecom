// OpenAPI registration for the seo module.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import { SitemapIndexDtoSchema, SitemapChunkDtoSchema, SitemapTypeSchema } from '../../shared/dto/seo.dto.js';

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });

const jsonResponse = (description: string, schema?: z.ZodType) => ({
  description,
  ...(schema ? { content: { 'application/json': { schema } } } : {}),
});

const typePageParams = z.object({ type: SitemapTypeSchema, page: z.coerce.number().int().min(1) });

openApiRegistry.registerPath({
  method: 'get',
  path: '/seo/sitemap/index',
  tags: ['SEO'],
  description:
    'Sitemap index info: the four chunk streams (categories/products/brands/cms) and how many ' +
    'chunks (pages) each carries. Chunks hold at most 45,000 URLs.',
  responses: {
    '200': jsonResponse('Sitemap index', envelope(SitemapIndexDtoSchema)),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/seo/sitemap/{type}/{page}',
  tags: ['SEO'],
  description:
    'One sitemap chunk: 1-based `page` of the given type, max 45,000 locale-prefixed `loc` paths ' +
    '(category `/{pathSlugs}/c/{code}`, product `/p/{slug}-{slugifiedFirstArticleNo}`, ' +
    '`/brands/{slug}`, `/e/{slug}`) with `updatedAt` lastmod where the model has timestamps. ' +
    'Out-of-range pages 404 so stale index data surfaces loudly.',
  request: { params: typePageParams },
  responses: {
    '200': jsonResponse('Sitemap chunk', envelope(SitemapChunkDtoSchema)),
    '400': jsonResponse('Unknown type or non-positive page'),
    '404': jsonResponse('Page beyond the last chunk (NOT_FOUND)'),
  },
});
