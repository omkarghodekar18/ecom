// CMS routes — public storefront reads + admin banner/page management. The
// router defines the FULL sub-path space with absolute-in-router paths, so it
// must be mounted at the API root: app.use(API_PREFIX, cmsRouter).
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorize } from '../../common/middleware/authorize.js';
import { asyncHandler } from '../../common/response/http.js';
import { cmsController } from './cms.controller.js';

export const cmsRouter = Router();

/** Admin guard for every back-office write in this module. */
const staffOnly = [authenticate, authorize('STAFF', 'ADMIN')] as const;

// Public storefront reads (spec 15.x home/page/banner surfaces)
cmsRouter.get('/cms/home', asyncHandler(cmsController.home));
cmsRouter.get('/cms/pages/:slug', asyncHandler(cmsController.pageBySlug));
cmsRouter.get('/banners', asyncHandler(cmsController.banners));

// Admin banner management (spec 11) — hard delete, no soft-delete columns.
cmsRouter.post('/admin/banners', ...staffOnly, asyncHandler(cmsController.createBanner));
cmsRouter.patch('/admin/banners/:id', ...staffOnly, asyncHandler(cmsController.updateBanner));
cmsRouter.delete('/admin/banners/:id', ...staffOnly, asyncHandler(cmsController.deleteBanner));

// Admin CMS page management (spec 11) — keyed by slug, not id.
cmsRouter.post('/admin/cms/pages', ...staffOnly, asyncHandler(cmsController.upsertPage));
cmsRouter.patch('/admin/cms/pages/:slug', ...staffOnly, asyncHandler(cmsController.updatePage));
