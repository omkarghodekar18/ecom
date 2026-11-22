// Imports routes (spec 16.1): STAFF/ADMIN for upload, list, detail, report,
// template and commit; ADMIN only for rollback. Mounted at the API root —
// the router owns the /admin/imports/* sub-path space.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorize } from '../../common/middleware/authorize.js';
import { asyncHandler } from '../../common/response/http.js';
import { importsController } from './imports.controller.js';

export const importsRouter = Router();

const staffOnly = [authenticate, authorize('STAFF', 'ADMIN')] as const;
const adminOnly = [authenticate, authorize('ADMIN')] as const;

importsRouter.post('/admin/imports', ...staffOnly, asyncHandler(importsController.upload));
importsRouter.get('/admin/imports', ...staffOnly, asyncHandler(importsController.list));
importsRouter.get('/admin/imports/template', ...staffOnly, asyncHandler(importsController.template));
importsRouter.get('/admin/imports/:id', ...staffOnly, asyncHandler(importsController.detail));
importsRouter.get('/admin/imports/:id/report', ...staffOnly, asyncHandler(importsController.report));
importsRouter.post('/admin/imports/:id/commit', ...staffOnly, asyncHandler(importsController.commit));
importsRouter.post('/admin/imports/:id/rollback', ...adminOnly, asyncHandler(importsController.rollback));
importsRouter.post('/admin/imports/:id/cancel', ...staffOnly, asyncHandler(importsController.cancel));
