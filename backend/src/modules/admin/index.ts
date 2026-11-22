// admin module — public surface.
import './admin.openapi.js';

export { adminRouter } from './admin.routes.js';
export { getAdminStats, type AdminStatsDto } from './admin.stats.service.js';
export {
  adminOrdersService,
  nextStatuses,
  OrderStatusSchema,
  AdminOrdersQuerySchema,
  type AdminOrderStatus,
} from './admin.orders.service.js';
export {
  adminUsersService,
  AdminUsersQuerySchema,
  UpdateUserSchema,
  UpdateCompanySchema,
} from './admin.users.service.js';
export { adminAuditService, adminSettingsService, AuditQuerySchema } from './admin.audit.service.js';
