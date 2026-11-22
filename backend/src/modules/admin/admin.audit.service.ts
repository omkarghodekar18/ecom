// Admin audit-log + settings service (spec Section 15.9/15.10): the audit
// viewer feed and the guarded settings editor (ADMIN only — tax, shipping,
// stock policy, feature flags).
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { writeAudit } from '../../services/audit/index.js';
import { settingsService } from '../../services/settings/index.js';

export const AuditQuerySchema = z.object({
  entity: z.string().trim().max(40).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AuditQuery = z.infer<typeof AuditQuerySchema>;

export const adminAuditService = {
  /** GET /admin/audit-logs — newest first, actor email resolved. */
  async listLogs(query: AuditQuery) {
    const where = {
      ...(query.entity !== undefined && query.entity !== '' ? { entity: query.entity } : {}),
      ...(query.q !== undefined && query.q !== ''
        ? { OR: [{ action: { contains: query.q, mode: 'insensitive' as const } }, { entityId: { contains: query.q } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);
    // AuditLog stores actorId without a FK relation (spec schema) — resolve
    // emails in one extra query for the page.
    const actorIds = [...new Set(rows.map((row) => row.actorId).filter((id): id is string => id !== null))];
    const actors = await prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, email: true },
    });
    const emailById = new Map(actors.map((actor) => [actor.id, actor.email]));
    return {
      items: rows.map((row) => ({
        id: row.id,
        actorEmail: row.actorId !== null ? (emailById.get(row.actorId) ?? null) : null,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        diff: row.diff,
        ip: row.ip,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  },
};

export const adminSettingsService = {
  /** GET /admin/settings — the full settings document. */
  async getSettings() {
    return settingsService.getSettings();
  },

  /** PATCH /admin/settings — validated partial update (ADMIN only, audited). */
  async updateSettings(patch: Parameters<typeof settingsService.updateSettings>[0], actor: { userId: string; ip: string | null }) {
    const updated = await settingsService.updateSettings(patch);
    await writeAudit(actor.userId, 'settings.update', 'settings', null, patch, actor.ip);
    return updated;
  },
};
