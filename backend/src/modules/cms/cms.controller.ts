// CMS controller — validates with module-owned zod schemas and delegates to
// cms.service; admin handlers resolve the acting user + IP for audit.
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireUserId } from '../../common/middleware/authenticate.js';
import { ok, okCreated } from '../../common/response/http.js';
import { BannerPlacementSchema } from '../../shared/dto/cms.dto.js';
import { cmsService } from './cms.service.js';
import {
  CreateBannerInputSchema,
  SaveCmsPageInputSchema,
  UpdateBannerInputSchema,
  UpdateCmsPageInputSchema,
} from './cms.service.js';

const slugParamSchema = z.object({ slug: z.string().min(1) });
const idParamSchema = z.object({ id: z.string().min(1) });
const placementQuerySchema = z.object({ placement: BannerPlacementSchema });

const noContent = (res: Response): void => {
  res.status(204).send();
};

/** CMS endpoint handlers — plain async functions; routes wrap them with asyncHandler. */
export const cmsController = {
  async home(_req: Request, res: Response): Promise<void> {
    ok(res, await cmsService.home());
  },

  async pageBySlug(req: Request, res: Response): Promise<void> {
    const { slug } = slugParamSchema.parse(req.params);
    ok(res, await cmsService.pageBySlug(slug));
  },

  async banners(req: Request, res: Response): Promise<void> {
    const { placement } = placementQuerySchema.parse(req.query);
    ok(res, await cmsService.listBanners(placement));
  },

  // ── admin (authenticate + authorize('STAFF','ADMIN') applied on the router) ──

  async createBanner(req: Request, res: Response): Promise<void> {
    const input = CreateBannerInputSchema.parse(req.body);
    okCreated(res, await cmsService.createBanner(requireUserId(req), input, req.ip ?? null));
  },

  async updateBanner(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = UpdateBannerInputSchema.parse(req.body);
    ok(res, await cmsService.updateBanner(requireUserId(req), id, input, req.ip ?? null));
  },

  async deleteBanner(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await cmsService.deleteBanner(requireUserId(req), id, req.ip ?? null);
    noContent(res);
  },

  async upsertPage(req: Request, res: Response): Promise<void> {
    const input = SaveCmsPageInputSchema.parse(req.body);
    const { page, created } = await cmsService.upsertPage(requireUserId(req), input, req.ip ?? null);
    if (created) okCreated(res, page);
    else ok(res, page);
  },

  async updatePage(req: Request, res: Response): Promise<void> {
    const { slug } = slugParamSchema.parse(req.params);
    const input = UpdateCmsPageInputSchema.parse(req.body);
    ok(res, await cmsService.updatePage(requireUserId(req), slug, input, req.ip ?? null));
  },
};
