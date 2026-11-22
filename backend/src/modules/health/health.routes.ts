// GET /health — liveness; GET /health/ready — dependency checks.
import { Router } from 'express';
import { asyncHandler, ok } from '../../common/response/http.js';
import { healthService, readiness } from './health.service.js';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    ok(res, healthService());
  }),
);

healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    ok(res, await readiness());
  }),
);
