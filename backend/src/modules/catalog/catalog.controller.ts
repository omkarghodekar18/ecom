// Catalog controller — validates with module-owned zod schemas and delegates
// to catalog.service; admin handlers resolve the acting user + IP for audit.
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireUserId } from '../../common/middleware/authenticate.js';
import { ok, okCreated } from '../../common/response/http.js';
import { catalogService } from './catalog.service.js';
import {
  CreateCategoryInputSchema,
  MoveCategoryInputSchema,
  ReorderCategoryInputSchema,
  UpdateCategoryInputSchema,
} from './catalog.service.js';

const codeParamSchema = z.object({ code: z.string().min(1) });
const idParamSchema = z.object({ id: z.string().min(1) });
/** ?depth= navigation tree depth — default 2; the public header uses 2–3,
 *  the admin tree manager asks for the full tree (max 10). */
const depthQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(10).default(2),
});

const noContent = (res: Response): void => {
  res.status(204).send();
};

/** Catalog endpoint handlers — plain async functions; routes wrap them with asyncHandler. */
export const catalogController = {
  async navigationTree(req: Request, res: Response): Promise<void> {
    const { depth } = depthQuerySchema.parse(req.query);
    ok(res, await catalogService.navigationTree(depth));
  },

  async categoryByCode(req: Request, res: Response): Promise<void> {
    const { code } = codeParamSchema.parse(req.params);
    ok(res, await catalogService.categoryByCode(code));
  },

  async children(req: Request, res: Response): Promise<void> {
    const { code } = codeParamSchema.parse(req.params);
    ok(res, await catalogService.children(code));
  },

  async filters(req: Request, res: Response): Promise<void> {
    const { code } = codeParamSchema.parse(req.params);
    ok(res, await catalogService.filters(code));
  },

  async breadcrumb(req: Request, res: Response): Promise<void> {
    const { code } = codeParamSchema.parse(req.params);
    ok(res, await catalogService.breadcrumb(code));
  },

  // ── admin (authenticate + authorize('STAFF','ADMIN') applied on the router) ──

  async createCategory(req: Request, res: Response): Promise<void> {
    const input = CreateCategoryInputSchema.parse(req.body);
    okCreated(res, await catalogService.createCategory(requireUserId(req), input, req.ip ?? null));
  },

  async updateCategory(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = UpdateCategoryInputSchema.parse(req.body);
    ok(res, await catalogService.updateCategory(requireUserId(req), id, input, req.ip ?? null));
  },

  async reorderCategories(req: Request, res: Response): Promise<void> {
    const items = ReorderCategoryInputSchema.parse(req.body);
    await catalogService.reorderCategories(requireUserId(req), items, req.ip ?? null);
    noContent(res);
  },

  async moveCategory(req: Request, res: Response): Promise<void> {
    const input = MoveCategoryInputSchema.parse(req.body);
    ok(res, await catalogService.moveCategory(requireUserId(req), input, req.ip ?? null));
  },

  async deleteCategory(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await catalogService.deleteCategory(requireUserId(req), id, req.ip ?? null);
    noContent(res);
  },
};
