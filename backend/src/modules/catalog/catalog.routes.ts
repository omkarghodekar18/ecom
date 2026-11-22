// Catalog routes — public consumer reads + admin category management. The
// router defines the FULL sub-path space with absolute-in-router paths, so it
// must be mounted at the API root: app.use(API_PREFIX, catalogRouter).
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorize } from '../../common/middleware/authorize.js';
import { asyncHandler } from '../../common/response/http.js';
import { catalogController } from './catalog.controller.js';

export const catalogRouter = Router();

/** Admin guard for every back-office write in this module. */
const staffOnly = [authenticate, authorize('STAFF', 'ADMIN')] as const;

// Public catalog reads (spec 15.1–15.3)
catalogRouter.get('/navigation/tree', asyncHandler(catalogController.navigationTree));
catalogRouter.get('/categories/:code', asyncHandler(catalogController.categoryByCode));
catalogRouter.get('/categories/:code/children', asyncHandler(catalogController.children));
catalogRouter.get('/categories/:code/filters', asyncHandler(catalogController.filters));
catalogRouter.get('/categories/:code/breadcrumb', asyncHandler(catalogController.breadcrumb));

// Admin category management (spec 11) — fixed action paths must be registered
// before the '/:id' param routes so they are not captured as an id.
catalogRouter.post('/admin/categories', ...staffOnly, asyncHandler(catalogController.createCategory));
catalogRouter.patch('/admin/categories/reorder', ...staffOnly, asyncHandler(catalogController.reorderCategories));
catalogRouter.patch('/admin/categories/move', ...staffOnly, asyncHandler(catalogController.moveCategory));
catalogRouter.patch('/admin/categories/:id', ...staffOnly, asyncHandler(catalogController.updateCategory));
catalogRouter.delete('/admin/categories/:id', ...staffOnly, asyncHandler(catalogController.deleteCategory));
