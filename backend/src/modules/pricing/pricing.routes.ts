// Pricing routes — effective price resolution for variant lines. The router
// defines the FULL sub-path space with absolute-in-router paths, so it must be
// mounted at the API root: app.use(API_PREFIX, pricingRouter).
import { Router } from 'express';
import { asyncHandler } from '../../common/response/http.js';
import { pricingController } from './pricing.controller.js';

export const pricingRouter = Router();

// Optional auth: the controller verifies the bearer itself so guests can
// resolve list/tier prices without an account.
pricingRouter.post('/pricing/resolve', asyncHandler(pricingController.resolve));
