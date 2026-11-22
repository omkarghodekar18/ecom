// Admin users/companies service (spec Section 15.7): customer + company lists,
// activate/deactivate, role assignment, company edits. ADMIN only; nobody can
// deactivate or demote their own account (lock-out guard).
import { z } from 'zod';
import { ERR } from '../../config/constants.js';
import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../db/prisma.js';
import { writeAudit } from '../../services/audit/index.js';

export const AdminUsersQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminUsersQuery = z.infer<typeof AdminUsersQuerySchema>;

export const UpdateUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']).optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export const UpdateCompanySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  gstin: z.string().trim().max(15).optional(),
  customerNumber: z.string().trim().max(30).optional(),
});
export type UpdateCompanyInput = z.infer<typeof UpdateCompanySchema>;

export const adminUsersService = {
  /** GET /admin/users — filtered user list with company names. */
  async listUsers(query: AdminUsersQuery) {
    const where = {
      ...(query.role !== undefined ? { role: query.role } : {}),
      ...(query.q !== undefined && query.q !== ''
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' as const } },
              { firstName: { contains: query.q, mode: 'insensitive' as const } },
              { lastName: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          type: true,
          isActive: true,
          emailVerifiedAt: true,
          lastLoginAt: true,
          createdAt: true,
          company: { select: { id: true, name: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: `${row.firstName} ${row.lastName}`,
        role: row.role,
        type: row.type,
        isActive: row.isActive,
        emailVerified: row.emailVerifiedAt !== null,
        lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        companyId: row.company?.id ?? null,
        companyName: row.company?.name ?? null,
      })),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  },

  /** PATCH /admin/users/:id — activate/deactivate + role (self-guarded). */
  async updateUser(
    userId: string,
    input: UpdateUserInput,
    actor: { userId: string; ip: string | null },
  ) {
    if (userId === actor.userId && ((input.isActive !== undefined && !input.isActive) || input.role !== undefined)) {
      throw new AppError(ERR.CONFLICT, 'You cannot deactivate or change the role of your own account', 409);
    }
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (existing === null) throw new AppError(ERR.NOT_FOUND, 'User not found', 404);
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
      },
    });
    await writeAudit(actor.userId, 'user.update', 'user', userId, input, actor.ip);
    return this.listUsers({ page: 1, pageSize: 1 }).then(() => ({ id: userId, ...input }));
  },

  /** GET /admin/companies — with user counts. */
  async listCompanies() {
    const rows = await prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, customerPrices: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      gstin: row.gstin,
      customerNumber: row.customerNumber,
      users: row._count.users,
      customerPrices: row._count.customerPrices,
      createdAt: row.createdAt.toISOString(),
    }));
  },

  /** PATCH /admin/companies/:id. */
  async updateCompany(companyId: string, input: UpdateCompanyInput, actor: { userId: string; ip: string | null }) {
    const existing = await prisma.company.findUnique({ where: { id: companyId } });
    if (existing === null) throw new AppError(ERR.NOT_FOUND, 'Company not found', 404);
    await prisma.company.update({ where: { id: companyId }, data: input });
    await writeAudit(actor.userId, 'company.update', 'company', companyId, input, actor.ip);
    return { id: companyId, ...input };
  },
};
