// Users controller — validates input, delegates to users.service.
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireUserId } from '../../common/middleware/authenticate.js';
import { ok } from '../../common/response/http.js';
import { ChangePasswordInputSchema, UpdateProfileInputSchema } from '../../shared/dto/users.dto.js';
import { usersService } from './users.service.js';

const sessionIdSchema = z.object({ id: z.string().min(1) });

const noContent = (res: Response): void => {
  res.status(204).send();
};

/** Account-area handlers — plain async functions; routes wrap them with asyncHandler. */
export const usersController = {
  async listSessions(req: Request, res: Response): Promise<void> {
    const sessions = await usersService.listSessions(requireUserId(req), req.sessionId);
    ok(res, sessions);
  },

  async revokeSession(req: Request, res: Response): Promise<void> {
    const { id } = sessionIdSchema.parse(req.params);
    await usersService.revokeSession(requireUserId(req), id, req.ip ?? null);
    noContent(res);
  },

  async revokeOtherSessions(req: Request, res: Response): Promise<void> {
    await usersService.revokeOtherSessions(requireUserId(req), req.sessionId, req.ip ?? null);
    noContent(res);
  },

  async updateProfile(req: Request, res: Response): Promise<void> {
    const input = UpdateProfileInputSchema.parse(req.body);
    ok(res, await usersService.updateProfile(requireUserId(req), input));
  },

  async changePassword(req: Request, res: Response): Promise<void> {
    const input = ChangePasswordInputSchema.parse(req.body);
    await usersService.changePassword(requireUserId(req), input, req.sessionId, req.ip ?? null);
    noContent(res);
  },
};
