// Attributes routes — public definition reads + admin attribute/category-mapping
// management. The router defines the FULL sub-path space with absolute-in-router
// paths, so it must be mounted at the API root: app.use(API_PREFIX, attributesRouter).
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorize } from '../../common/middleware/authorize.js';
import { asyncHandler } from '../../common/response/http.js';
import { attributesController } from './attributes.controller.js';

export const attributesRouter = Router();

/** Admin guard for every back-office write in this module. */
const staffOnly = [authenticate, authorize('STAFF', 'ADMIN')] as const;

// Public reads (spec 15.3)
attributesRouter.get('/attributes', asyncHandler(attributesController.list));
attributesRouter.get('/attributes/:key', asyncHandler(attributesController.byKey));

// Admin: attribute definitions (spec 11)
attributesRouter.post('/admin/attributes', ...staffOnly, asyncHandler(attributesController.create));
attributesRouter.patch('/admin/attributes/:id', ...staffOnly, asyncHandler(attributesController.update));
attributesRouter.delete('/admin/attributes/:id', ...staffOnly, asyncHandler(attributesController.remove));

// Admin: category→attribute mapping (spec 11/15.3). Path is category-scoped
// but the mapping domain belongs to this module.
attributesRouter.put(
  '/admin/categories/:id/attributes',
  ...staffOnly,
  asyncHandler(attributesController.replaceMapping),
);
