// Addresses controller — validates with the shared zod contract; PATCH takes
// a partial body (every field optional).
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireUserId } from '../../common/middleware/authenticate.js';
import { ok, okCreated } from '../../common/response/http.js';
import { AddressInputSchema } from '../../shared/dto/address.dto.js';
import { addressesService } from './addresses.service.js';

const idSchema = z.object({ id: z.string().min(1) });
const addressPatchSchema = AddressInputSchema.partial();

const noContent = (res: Response): void => {
  res.status(204).send();
};

/** Address book handlers — plain async functions; routes wrap them with asyncHandler. */
export const addressesController = {
  async list(req: Request, res: Response): Promise<void> {
    ok(res, await addressesService.list(requireUserId(req)));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = AddressInputSchema.parse(req.body);
    okCreated(res, await addressesService.create(requireUserId(req), input));
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idSchema.parse(req.params);
    const input = addressPatchSchema.parse(req.body);
    ok(res, await addressesService.update(requireUserId(req), id, input));
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idSchema.parse(req.params);
    await addressesService.remove(requireUserId(req), id);
    noContent(res);
  },
};
