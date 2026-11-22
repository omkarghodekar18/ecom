// Admin controller — parse/validate, resolve the actor (id + ip) and delegate
// to the admin services. Every write records an audit log inside its service.
import type { Request, Response } from 'express';
import { requireUserId } from '../../common/middleware/authenticate.js';
import { ok } from '../../common/response/http.js';
import { getAdminStats } from './admin.stats.service.js';
import {
  AdminOrdersQuerySchema,
  adminOrdersService,
  OrderStatusSchema,
} from './admin.orders.service.js';
import {
  adminUsersService,
  AdminUsersQuerySchema,
  UpdateCompanySchema,
  UpdateUserSchema,
} from './admin.users.service.js';
import { adminAuditService, adminSettingsService, AuditQuerySchema } from './admin.audit.service.js';
import { z } from 'zod';

function actor(req: Request): { userId: string; ip: string | null } {
  return { userId: requireUserId(req), ip: req.ip ?? null };
}

const UpdateOrderSchema = z.object({
  status: OrderStatusSchema.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const adminController = {
  async stats(_req: Request, res: Response): Promise<void> {
    ok(res, await getAdminStats());
  },

  async listOrders(req: Request, res: Response): Promise<void> {
    const query = AdminOrdersQuerySchema.parse(req.query);
    const { items, meta } = await adminOrdersService.listOrders(query);
    ok(res, items, meta);
  },

  async getOrder(req: Request, res: Response): Promise<void> {
    ok(res, await adminOrdersService.getOrder(String(req.params.orderNo)));
  },

  async updateOrder(req: Request, res: Response): Promise<void> {
    const input = UpdateOrderSchema.parse(req.body);
    ok(res, await adminOrdersService.updateOrder(String(req.params.orderNo), input, actor(req)));
  },

  async resendOrderEmail(req: Request, res: Response): Promise<void> {
    ok(res, await adminOrdersService.resendEmail(String(req.params.orderNo)));
  },

  async exportOrdersCsv(req: Request, res: Response): Promise<void> {
    const query = AdminOrdersQuerySchema.parse(req.query);
    const csv = await adminOrdersService.exportCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    res.send(csv);
  },

  async listUsers(req: Request, res: Response): Promise<void> {
    const query = AdminUsersQuerySchema.parse(req.query);
    const { items, meta } = await adminUsersService.listUsers(query);
    ok(res, items, meta);
  },

  async updateUser(req: Request, res: Response): Promise<void> {
    const input = UpdateUserSchema.parse(req.body);
    ok(res, await adminUsersService.updateUser(String(req.params.id), input, actor(req)));
  },

  async listCompanies(_req: Request, res: Response): Promise<void> {
    ok(res, await adminUsersService.listCompanies());
  },

  async updateCompany(req: Request, res: Response): Promise<void> {
    const input = UpdateCompanySchema.parse(req.body);
    ok(res, await adminUsersService.updateCompany(String(req.params.id), input, actor(req)));
  },

  async listAuditLogs(req: Request, res: Response): Promise<void> {
    const query = AuditQuerySchema.parse(req.query);
    const { items, meta } = await adminAuditService.listLogs(query);
    ok(res, items, meta);
  },

  async getSettings(_req: Request, res: Response): Promise<void> {
    ok(res, await adminSettingsService.getSettings());
  },

  async updateSettings(req: Request, res: Response): Promise<void> {
    // Settings shape is validated by the settings service itself (per-key zod).
    ok(res, await adminSettingsService.updateSettings(req.body, actor(req)));
  },
};
