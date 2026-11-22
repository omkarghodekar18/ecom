// Pricing controller — POST /pricing/resolve with OPTIONAL authentication:
// guests resolve list/tier prices; a presented-but-invalid or expired bearer
// still fails 401 (silently downgrading a signed-in customer to list prices
// would misprice their cart). No optional-auth middleware exists yet, so the
// controller verifies the bearer itself with the same error codes as
// `authenticate`.
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ERR } from '../../config/constants.js';
import { unauthorized } from '../../common/errors/app-error.js';
import { ok } from '../../common/response/http.js';
import { verifyAccessToken } from '../../common/utils/jwt.util.js';
import { pricingService } from './pricing.service.js';
import { ResolvePricesInputSchema } from './pricing.service.js';

/** Bearer → verified user id; absent header (or foreign scheme) → guest. */
function optionalUserId(req: Request): string | null {
  const header = req.header('authorization');
  if (header === undefined) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try {
    return verifyAccessToken(token).sub;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw unauthorized('Access token expired', ERR.TOKEN_EXPIRED);
    }
    throw unauthorized('Invalid access token', ERR.TOKEN_INVALID);
  }
}

/** Pricing endpoint handlers — plain async functions; routes wrap them with asyncHandler. */
export const pricingController = {
  async resolve(req: Request, res: Response): Promise<void> {
    const input = ResolvePricesInputSchema.parse(req.body);
    ok(res, await pricingService.resolveForUser(input.lines, optionalUserId(req)));
  },
};
