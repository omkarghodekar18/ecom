// Brands controller — validates with module-owned zod schemas and delegates
// to brands.service; admin handlers resolve the acting user + IP for audit.
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireUserId } from '../../common/middleware/authenticate.js';
import { ok, okCreated } from '../../common/response/http.js';
import { brandsService } from './brands.service.js';
import { CreateBrandInputSchema, UpdateBrandInputSchema } from './brands.service.js';

const slugParamSchema = z.object({ slug: z.string().min(1) });
const idParamSchema = z.object({ id: z.string().min(1) });

const noContent = (res: Response): void => {
  res.status(204).send();
};

/** Brands endpoint handlers — plain async functions; routes wrap them with asyncHandler. */
export const brandsController = {
  async list(_req: Request, res: Response): Promise<void> {
    ok(res, await brandsService.list());
  },

  async bySlug(req: Request, res: Response): Promise<void> {
    const { slug } = slugParamSchema.parse(req.params);
    ok(res, await brandsService.bySlug(slug));
  },

  // ── admin (authenticate + authorize('STAFF','ADMIN') applied on the router) ──

  async create(req: Request, res: Response): Promise<void> {
    const input = CreateBrandInputSchema.parse(req.body);
    okCreated(res, await brandsService.create(requireUserId(req), input, req.ip ?? null));
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = UpdateBrandInputSchema.parse(req.body);
    ok(res, await brandsService.update(requireUserId(req), id, input, req.ip ?? null));
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await brandsService.remove(requireUserId(req), id, req.ip ?? null);
    noContent(res);
  },
};
