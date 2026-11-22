// Attributes controller — validates with module-owned zod schemas and delegates
// to attributes.service; admin handlers resolve the acting user + IP for audit.
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireUserId } from '../../common/middleware/authenticate.js';
import { ok, okCreated } from '../../common/response/http.js';
import { attributesService } from './attributes.service.js';
import {
  CategoryMappingInputSchema,
  CreateAttributeInputSchema,
  UpdateAttributeInputSchema,
} from './attributes.service.js';

const keyParamSchema = z.object({ key: z.string().min(1) });
const idParamSchema = z.object({ id: z.string().min(1) });
/** ?categoryCode= switches the list to the effective mapped set for that category. */
const listQuerySchema = z.object({ categoryCode: z.string().min(1).optional() });

const noContent = (res: Response): void => {
  res.status(204).send();
};

/** Attributes endpoint handlers — plain async functions; routes wrap them with asyncHandler. */
export const attributesController = {
  async list(req: Request, res: Response): Promise<void> {
    const { categoryCode } = listQuerySchema.parse(req.query);
    ok(res, await attributesService.list(categoryCode));
  },

  async byKey(req: Request, res: Response): Promise<void> {
    const { key } = keyParamSchema.parse(req.params);
    ok(res, await attributesService.byKey(key));
  },

  // ── admin (authenticate + authorize('STAFF','ADMIN') applied on the router) ──

  async create(req: Request, res: Response): Promise<void> {
    const input = CreateAttributeInputSchema.parse(req.body);
    okCreated(res, await attributesService.create(requireUserId(req), input, req.ip ?? null));
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = UpdateAttributeInputSchema.parse(req.body);
    ok(res, await attributesService.update(requireUserId(req), id, input, req.ip ?? null));
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await attributesService.remove(requireUserId(req), id, req.ip ?? null);
    noContent(res);
  },

  async replaceMapping(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const items = CategoryMappingInputSchema.parse(req.body);
    ok(res, await attributesService.replaceMapping(requireUserId(req), id, items, req.ip ?? null));
  },
};
