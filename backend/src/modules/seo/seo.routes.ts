// SEO routes — sitemap index + chunk feed. Three GETs with param/query
// validation and no bodies/audit; handlers live here directly (health-module
// style) — a controller layer would be ceremony. The router defines the FULL
// sub-path space, so mount at the API root: app.use(API_PREFIX, seoRouter).
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok } from '../../common/response/http.js';
import { SitemapTypeSchema } from '../../shared/dto/seo.dto.js';
import { seoService } from './seo.service.js';

export const seoRouter = Router();

/** :type/:page path params — page is 1-based; bad type/page → 400 via ZodError. */
const typePageParamsSchema = z.object({
  type: SitemapTypeSchema,
  page: z.coerce.number().int().min(1),
});

// Registered before '/:type/:page' so 'index' can never be captured as a type.
seoRouter.get(
  '/seo/sitemap/index',
  asyncHandler(async (_req, res) => {
    ok(res, await seoService.sitemapIndex());
  }),
);

seoRouter.get(
  '/seo/sitemap/:type/:page',
  asyncHandler(async (req, res) => {
    const { type, page } = typePageParamsSchema.parse(req.params);
    ok(res, await seoService.sitemapChunk(type, page));
  }),
);
