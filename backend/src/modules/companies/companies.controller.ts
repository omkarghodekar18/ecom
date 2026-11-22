// Companies controller — validates and delegates to companies.service.
import type { Request, Response } from 'express';
import { requireUserId } from '../../common/middleware/authenticate.js';
import { ok } from '../../common/response/http.js';
import { getMyCompany } from './companies.service.js';

export const companiesController = {
  /** GET /companies/me handler (wrapped with asyncHandler by the routes). */
  async me(req: Request, res: Response): Promise<void> {
    ok(res, await getMyCompany(requireUserId(req)));
  },
};
