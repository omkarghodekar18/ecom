// Brands routes — public reads + admin CRUD. The router defines the FULL
// sub-path space with absolute-in-router paths, so it must be mounted at the
// API root: app.use(API_PREFIX, brandsRouter).
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorize } from '../../common/middleware/authorize.js';
import { asyncHandler } from '../../common/response/http.js';
import { brandsController } from './brands.controller.js';

export const brandsRouter = Router();

/** Admin guard for every back-office write in this module. */
const staffOnly = [authenticate, authorize('STAFF', 'ADMIN')] as const;

// Public reads (spec 15.x) — read-only here; product listing by brand is the
// products module's job.
brandsRouter.get('/brands', asyncHandler(brandsController.list));
brandsRouter.get('/brands/:slug', asyncHandler(brandsController.bySlug));

// Admin brand management (spec 11)
brandsRouter.post('/admin/brands', ...staffOnly, asyncHandler(brandsController.create));
brandsRouter.patch('/admin/brands/:id', ...staffOnly, asyncHandler(brandsController.update));
brandsRouter.delete('/admin/brands/:id', ...staffOnly, asyncHandler(brandsController.remove));
