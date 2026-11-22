// Imports controller (spec 16.1): upload (base64 JSON), dry-run trigger is
// implicit in upload, commit, rollback, cancel, list/detail/issues/report and
// the template download. STAFF may upload/dry-run/commit; rollback is
// ADMIN-only per spec 16.1 step 5.
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireUserId } from '../../common/middleware/authenticate.js';
import { ok, okCreated } from '../../common/response/http.js';
import { parsePagination } from '../../common/pagination.js';
import { AppError } from '../../common/errors/app-error.js';
import { ERR } from '../../config/constants.js';
import { ImportOptionsSchema } from './imports.errors.js';
import * as service from './imports.service.js';
import { generateTemplate } from './templates/template.generator.js';

const UploadSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentBase64: z.string().min(1),
  mode: z.enum(['XLSX', 'CSV']),
  options: ImportOptionsSchema.partial().optional(),
});

function actor(req: Request): { userId: string; ip: string | null } {
  return { userId: requireUserId(req), ip: req.ip ?? null };
}

const idSchema = z.object({ id: z.string().min(1) });

export const importsController = {
  async upload(req: Request, res: Response): Promise<void> {
    const input = UploadSchema.parse(req.body);
    const { userId, ip } = actor(req);
    const result = await service.createImportJob(userId, ip, input);
    okCreated(res, result);
  },

  async commit(req: Request, res: Response): Promise<void> {
    const { id } = idSchema.parse(req.params);
    const { userId, ip } = actor(req);
    ok(res, await service.startCommit(id, userId, ip));
  },

  async rollback(req: Request, res: Response): Promise<void> {
    const { id } = idSchema.parse(req.params);
    const { userId, ip } = actor(req);
    ok(res, await service.rollbackJob(id, userId, ip));
  },

  async cancel(req: Request, res: Response): Promise<void> {
    const { id } = idSchema.parse(req.params);
    const job = await (await import('../../db/prisma.js')).prisma.importJob.findUnique({ where: { id } });
    if (job === null) throw new AppError(ERR.NOT_FOUND, 'Import job not found', 404);
    if (['COMPLETED', 'FAILED', 'ROLLED_BACK', 'CANCELLED'].includes(job.status)) {
      throw new AppError(ERR.CONFLICT, 'Job already finished', 409, { status: job.status });
    }
    await (await import('../../db/prisma.js')).prisma.importJob.update({ where: { id }, data: { status: 'CANCELLED', finishedAt: new Date() } });
    ok(res, { cancelled: true });
  },

  async list(req: Request, res: Response): Promise<void> {
    const page = parsePagination(req.query as Record<string, string>);
    const result = await service.listJobs(page.page, page.pageSize);
    ok(res, result.items, { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)) });
  },

  async detail(req: Request, res: Response): Promise<void> {
    const { id } = idSchema.parse(req.params);
    const query = z
      .object({
        issuePage: z.coerce.number().int().min(1).default(1),
        issuePageSize: z.coerce.number().int().min(1).max(200).default(50),
        severity: z.enum(['ERROR', 'WARNING']).optional(),
      })
      .parse(req.query);
    const result = await service.jobDetail(id, query.issuePage, query.issuePageSize, query.severity);
    ok(res, result);
  },

  async report(req: Request, res: Response): Promise<void> {
    const { id } = idSchema.parse(req.params);
    const report = await service.jobErrorReport(id);
    if (report === null) throw new AppError(ERR.NOT_FOUND, 'Import job not found', 404);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
    res.send(report.buffer);
  },

  async template(req: Request, res: Response): Promise<void> {
    const query = z.object({ categoryCode: z.string().trim().optional() }).parse(req.query);
    const buffer = await generateTemplate(query.categoryCode);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="toolhub-import-template${query.categoryCode !== undefined ? `-${query.categoryCode}` : ''}.xlsx"`);
    res.send(buffer);
  },
};
