// Settings routes — public commerce slice. Mounted at the API root:
//   app.use(API_PREFIX, settingsRouter)
import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler, ok } from '../../common/response/http.js';
import { getCommerceSettings } from './settings.service.js';

async function commerce(_req: Request, res: Response): Promise<void> {
  ok(res, await getCommerceSettings());
}

export const settingsRouter = Router();
settingsRouter.get('/settings/commerce', asyncHandler(commerce));
