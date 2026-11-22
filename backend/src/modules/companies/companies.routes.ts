// Companies routes — B2B company view, Bearer-authenticated.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { asyncHandler } from '../../common/response/http.js';
import { companiesController } from './companies.controller.js';

export const companiesRouter = Router();

companiesRouter.get('/me', authenticate, asyncHandler(companiesController.me));
