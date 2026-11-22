// Admin routes (spec Section 15) — RBAC: STAFF manages orders + reads stats;
// ADMIN additionally manages users, companies, audit logs and settings.
// Catalog/attributes/brands/products/cms admin routes live in their domain
// modules under the same /admin prefix. Mounted at the API root.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorize } from '../../common/middleware/authorize.js';
import { asyncHandler } from '../../common/response/http.js';
import { adminController } from './admin.controller.js';

const staffOnly = [authenticate, authorize('STAFF', 'ADMIN')] as const;
const adminOnly = [authenticate, authorize('ADMIN')] as const;

export const adminRouter = Router();

adminRouter.get('/admin/stats', ...staffOnly, asyncHandler(adminController.stats));

adminRouter.get('/admin/orders', ...staffOnly, asyncHandler(adminController.listOrders));
adminRouter.get('/admin/orders/export', ...staffOnly, asyncHandler(adminController.exportOrdersCsv));
adminRouter.get('/admin/orders/:orderNo', ...staffOnly, asyncHandler(adminController.getOrder));
adminRouter.patch('/admin/orders/:orderNo', ...staffOnly, asyncHandler(adminController.updateOrder));
adminRouter.post('/admin/orders/:orderNo/resend-email', ...staffOnly, asyncHandler(adminController.resendOrderEmail));

adminRouter.get('/admin/users', ...adminOnly, asyncHandler(adminController.listUsers));
adminRouter.patch('/admin/users/:id', ...adminOnly, asyncHandler(adminController.updateUser));
adminRouter.get('/admin/companies', ...adminOnly, asyncHandler(adminController.listCompanies));
adminRouter.patch('/admin/companies/:id', ...adminOnly, asyncHandler(adminController.updateCompany));

adminRouter.get('/admin/audit-logs', ...adminOnly, asyncHandler(adminController.listAuditLogs));

adminRouter.get('/admin/settings', ...adminOnly, asyncHandler(adminController.getSettings));
adminRouter.patch('/admin/settings', ...adminOnly, asyncHandler(adminController.updateSettings));
