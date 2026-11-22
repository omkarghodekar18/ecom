// SEO contract: sitemap chunk feed for the storefront (spec Section 13).
// Mirrored to frontend — only zod + relative imports.
import { z } from 'zod';

/** Sitemap entity types — one chunk stream per type. */
export const SitemapTypeSchema = z.enum(['categories', 'products', 'brands', 'cms']);
export type SitemapType = z.infer<typeof SitemapTypeSchema>;

/** One sitemap URL: storefront path (locale-prefixed, no origin) + lastmod. */
export const SitemapUrlSchema = z.object({
  loc: z.string(),
  /** ISO lastmod; brands carry no timestamps in the schema → null. */
  updatedAt: z.string().nullable(),
});
export type SitemapUrl = z.infer<typeof SitemapUrlSchema>;

/** One chunk: at most 45,000 URLs (the sitemap protocol's per-file budget). */
export const SitemapChunkDtoSchema = z.object({
  type: SitemapTypeSchema,
  page: z.number().int(),
  totalPages: z.number().int(),
  urls: z.array(SitemapUrlSchema),
});
export type SitemapChunkDto = z.infer<typeof SitemapChunkDtoSchema>;

export const SitemapIndexTypeDtoSchema = z.object({
  type: SitemapTypeSchema,
  totalPages: z.number().int(),
});
export type SitemapIndexTypeDto = z.infer<typeof SitemapIndexTypeDtoSchema>;

/** GET /seo/sitemap/index — which chunk streams exist and how long they are. */
export const SitemapIndexDtoSchema = z.object({
  types: z.array(SitemapIndexTypeDtoSchema),
});
export type SitemapIndexDto = z.infer<typeof SitemapIndexDtoSchema>;
