// Imports service (spec 16.1/16.4): job lifecycle — upload (file persisted,
// SHA-256 hashed, job row), dry run (parse + all 5 validation layers + plan,
// NO catalog writes), commit (batched, snapshotting, postProcess) and
// rollback. Heavy work runs on the pg-boss queue (InlineQueueService in dev
// and tests runs it inline); the service functions are what the workers call.
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { ERR } from '../../config/constants.js';
import { logger } from '../../config/logger.js';
import { writeAudit } from '../../services/audit/index.js';
import { queue } from '../../services/queue/index.js';
import { DEFAULT_IMPORT_OPTIONS, issue, type ImportIssueDraft, type ImportOptions } from './imports.errors.js';
import { parseCsv, parseXlsx, sha256File, type ParsedWorkbook } from './parsers/import.parser.js';
import { validateAndNormalize, type NormalizedWorkbook } from './schemas/sheet.schemas.js';
import { preflightFile, validateSheets } from './validators/file.validator.js';
import { buildRefContext, validateRefs, type RefContext } from './validators/refs.validator.js';
import { primeSlugProbe, validateUniqueness } from './validators/uniqueness.validator.js';
import { validateBusiness } from './validators/business.validator.js';
import { buildPlan, commitPlan, rollbackImport, type ImportPlan } from './committers/import.committer.js';

export const IMPORTS_DRY_RUN_QUEUE = 'imports.dry-run';
export const IMPORTS_COMMIT_QUEUE = 'imports.commit';

function importsDir(): string {
  return path.resolve(process.cwd(), 'var', 'imports');
}

async function filePathFor(jobId: string, extension: string): Promise<string> {
  const dir = importsDir();
  await mkdir(dir, { recursive: true });
  return path.join(dir, `${jobId}.${extension}`);
}

export interface UploadInput {
  fileName: string;
  /** Base64 (or base64url) file content — JSON upload keeps the API simple. */
  contentBase64: string;
  mode: 'XLSX' | 'CSV';
  options?: Partial<ImportOptions>;
}

/** Step 1: persist the file + create the job, then enqueue the dry run. */
export async function createImportJob(actorId: string, ip: string | null, input: UploadInput): Promise<{ jobId: string }> {
  const options: ImportOptions = { ...DEFAULT_IMPORT_OPTIONS, ...(input.options ?? {}) };
  const extension = input.mode === 'CSV' ? 'csv' : 'xlsx';
  const content = Buffer.from(input.contentBase64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

  // Provisional job row (id needed for the file path).
  const job = await prisma.importJob.create({
    data: {
      type: 'PRODUCT_CATALOG',
      status: 'UPLOADED',
      fileName: input.fileName.slice(0, 200),
      fileSha256: 'pending',
      mode: input.mode,
      options: options as unknown as Prisma.InputJsonValue,
      createdById: actorId,
    },
  });
  const target = await filePathFor(job.id, extension);
  await writeFile(target, content);

  const sha256 = await sha256File(target);
  await prisma.importJob.update({ where: { id: job.id }, data: { fileSha256: sha256 } });
  await writeAudit(actorId, 'import.upload', 'import-job', job.id, { fileName: input.fileName, mode: input.mode, options }, ip);

  await queue.enqueue(IMPORTS_DRY_RUN_QUEUE, { jobId: job.id });
  return { jobId: job.id };
}

export interface DryRunResult {
  status: 'READY_TO_COMMIT' | 'VALIDATED_WITH_ERRORS' | 'FAILED';
  totals: { errors: number; warnings: number; create: number; update: number; skip: number };
}

/**
 * The full validation pipeline. Writes NOTHING to the catalog: every issue is
 * persisted on the job with its stable code; the plan is stored in stats so
 * commit is deterministic and the preview can show create/update/skip counts.
 */
export async function runDryRun(jobId: string): Promise<DryRunResult> {
  const job = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
  const extension = job.mode === 'CSV' ? 'csv' : 'xlsx';
  const filePath = path.join(importsDir(), `${job.id}.${extension}`);

  try {
    await prisma.importJob.update({ where: { id: job.id }, data: { status: 'PARSING', startedAt: new Date() } });

    // ── L1 pre-parse gate: extension, size, magic bytes, macros, encryption ─
    const preflight = await preflightFile(filePath, job.fileName);
    if (preflight.length > 0) {
      await persistIssues(jobId, preflight);
      await prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: 'VALIDATED_WITH_ERRORS',
          finishedAt: new Date(),
          stats: { errors: preflight.length, warnings: 0, create: 0, update: 0, skip: 0 } as unknown as Prisma.InputJsonObject,
        },
      });
      return { status: 'VALIDATED_WITH_ERRORS', totals: { errors: preflight.length, warnings: 0, create: 0, update: 0, skip: 0 } };
    }

    // ── parse ────────────────────────────────────────────────────────────
    const parsed: ParsedWorkbook = job.mode === 'CSV' ? await parseCsv(filePath) : await parseXlsx(filePath);
    const options = job.options as unknown as ImportOptions;

    // ── L1 sheet-level: required sheets/headers, row limit, empty file ──
    const fileIssues = validateSheets(parsed);
    const fileErrors = fileIssues.filter((item) => item.severity === 'ERROR');
    if (fileErrors.length > 0) {
      await persistIssues(jobId, fileIssues);
      await prisma.importJob.update({
        where: { id: job.id },
        data: { status: 'VALIDATED_WITH_ERRORS', finishedAt: new Date(), stats: { errors: fileIssues.filter((i) => i.severity === 'ERROR').length, warnings: fileIssues.filter((i) => i.severity === 'WARNING').length, create: 0, update: 0, skip: 0 } },
      });
      return { status: 'VALIDATED_WITH_ERRORS', totals: countTotals(fileIssues, null) };
    }

    // ── parse → normalize → L2 schema ────────────────────────────────────
    await prisma.importJob.update({ where: { id: job.id }, data: { status: 'VALIDATING' } });
    const { normalized, issues: schemaIssues } = validateAndNormalize(parsed, options);

    // ── L3 refs (bulk-loaded context) ────────────────────────────────────
    const context = await buildRefContext(normalized, options);
    const refIssues = validateRefs(normalized, context);

    // ── L4 uniqueness + policy (+ slug probe) ────────────────────────────
    await primeSlugProbe(normalized, context);
    const uniquenessIssues = validateUniqueness(normalized, context, options);

    // ── L5 business rules ────────────────────────────────────────────────
    const businessIssues = validateBusiness(normalized);

    // ── idempotency: same file + options imported before? ────────────────
    const allIssues: ImportIssueDraft[] = [...fileIssues, ...schemaIssues, ...refIssues, ...uniquenessIssues, ...businessIssues];
    const priorRun = await prisma.importJob.findFirst({
      where: { fileSha256: job.fileSha256, status: { in: ['COMPLETED', 'COMMITTING'] }, id: { not: job.id } },
      select: { id: true, createdAt: true },
    });
    if (priorRun !== null) {
      allIssues.push(issue.warning('File', 0, 'ALREADY_IMPORTED', `The same file was imported on ${priorRun.createdAt.toISOString().slice(0, 10)} (job ${priorRun.id}).`));
    }

    // ── plan (diff: create/update/skip) ──────────────────────────────────
    const plan = buildPlan(normalized, context, options);
    const errors = allIssues.filter((item) => item.severity === 'ERROR').length;
    const warnings = allIssues.filter((item) => item.severity === 'WARNING').length;

    await persistIssues(jobId, allIssues);
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: errors === 0 ? 'READY_TO_COMMIT' : 'VALIDATED_WITH_ERRORS',
        finishedAt: new Date(),
        stats: {
          errors,
          warnings,
          create: plan.totals.create,
          update: plan.totals.update,
          skip: plan.totals.skip,
          plan: plan.entries.slice(0, 5_000),
          totals: plan.totals,
        } as unknown as Prisma.InputJsonObject,
      },
    });
    logger.info({ jobId, errors, warnings }, 'import dry run finished');
    return { status: errors === 0 ? 'READY_TO_COMMIT' : 'VALIDATED_WITH_ERRORS', totals: { errors, warnings, ...plan.totals } };
  } catch (error) {
    logger.error({ err: error, jobId }, "import dry run failed");
    await prisma.importJob.update({ where: { id: job.id }, data: { status: 'FAILED', finishedAt: new Date() } }).catch(() => undefined);
    return { status: 'FAILED', totals: { errors: 1, warnings: 0, create: 0, update: 0, skip: 0 } };
  }
}

/** Guarded commit entry (controller): validates state + lock, marks
 * COMMITTING and enqueues. With pg-boss the work runs in the background;
 * with the inline queue (dev/tests) it completes before the response. */
export async function startCommit(jobId: string, actorId: string, ip: string | null): Promise<{ queued: boolean }> {
  const job = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status !== 'READY_TO_COMMIT') {
    throw new AppError(ERR.CONFLICT, 'The dry run must be green before committing', 409, { status: job.status });
  }
  // Concurrency lock: only one COMMIT at a time.
  const committing = await prisma.importJob.findFirst({ where: { status: 'COMMITTING', id: { not: job.id } } });
  if (committing !== null) {
    throw new AppError(ERR.CONFLICT, 'Another import is currently committing', 409, { jobId: committing.id });
  }
  await prisma.importJob.update({ where: { id: job.id }, data: { status: 'COMMITTING' } });
  await queue.enqueue(IMPORTS_COMMIT_QUEUE, { jobId: job.id, actorId, ip });
  return { queued: true };
}

/** The commit worker body: re-validates and applies the plan in batches. */
export async function runCommit(jobId: string, actorId: string, ip: string | null): Promise<{ created: number; updated: number; skipped: number }> {
  const job = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status !== 'COMMITTING') {
    throw new AppError(ERR.CONFLICT, 'Job is not in COMMITTING state', 409, { status: job.status });
  }
  const extension = job.mode === 'CSV' ? 'csv' : 'xlsx';
  const filePath = path.join(importsDir(), `${job.id}.${extension}`);
  const options = job.options as unknown as ImportOptions;

  try {
    // Re-run validation: the catalog may have changed since the dry run.
    const parsed: ParsedWorkbook = job.mode === 'CSV' ? await parseCsv(filePath) : await parseXlsx(filePath);
    const { normalized } = validateAndNormalize(parsed, options);
    const context = await buildRefContext(normalized, options);
    const refIssues = validateRefs(normalized, context);
    await primeSlugProbe(normalized, context);
    const uniquenessIssues = validateUniqueness(normalized, context, options);
    const businessIssues = validateBusiness(normalized);
    const blocking = [...refIssues, ...uniquenessIssues, ...businessIssues].filter((item) => item.severity === 'ERROR');
    if (blocking.length > 0) {
      await persistIssues(jobId, blocking);
      await prisma.importJob.update({ where: { id: job.id }, data: { status: 'VALIDATED_WITH_ERRORS', finishedAt: new Date() } });
      throw new AppError(ERR.CONFLICT, 'Catalog changed since the dry run — re-run it', 409, { code: 'VALIDATION_CHANGED' });
    }
    const plan = buildPlan(normalized, context, options);
    const result = await commitPlan(job.id, actorId, ip, normalized, context, options, plan, async (processed, total) => {
      await prisma.importJob.update({
        where: { id: job.id },
        data: { stats: { ...((job.stats as Record<string, number>) ?? {}), progress: Math.round((processed / Math.max(total, 1)) * 100) } },
      }).catch(() => undefined);
    });
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
        stats: { ...((job.stats as Record<string, number>) ?? {}), created: result.created, updated: result.updated, skipped: result.skipped },
      },
    });
    logger.info({ jobId, ...result }, 'import committed');
    return result;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error({ err: error, jobId }, 'import commit failed');
    await prisma.importJob.update({ where: { id: job.id }, data: { status: 'FAILED', finishedAt: new Date() } }).catch(() => undefined);
    throw error;
  }
}

/** ADMIN-only rollback of the latest completed import (spec 16.1 step 5). */
export async function rollbackJob(jobId: string, actorId: string, ip: string | null): Promise<{ restored: number }> {
  const job = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status !== 'COMPLETED' && job.status !== 'FAILED') {
    throw new AppError(ERR.CONFLICT, 'Only completed imports can be rolled back', 409, { status: job.status });
  }
  // "Latest unmodified import": a NEWER completed import exists → warn (409
  // with details) so the admin consciously rolls back out of order.
  const newer = await prisma.importJob.findFirst({
    where: { status: 'COMPLETED', createdAt: { gt: job.createdAt }, id: { not: job.id } },
    select: { id: true },
  });
  if (newer !== null) {
    throw new AppError(ERR.CONFLICT, 'A newer completed import exists — rolling back out of order may be inconsistent', 409, { newerJobId: newer.id });
  }
  return rollbackImport(jobId, actorId, ip);
}

async function persistIssues(jobId: string, issues: ImportIssueDraft[]): Promise<void> {
  await prisma.importIssue.deleteMany({ where: { jobId } });
  const rows = issues.map((item) => ({
    jobId,
    sheet: item.sheet,
    rowNumber: item.rowNumber,
    column: item.column ?? null,
    severity: item.severity,
    code: item.code,
    message: item.message,
    rawValue: item.rawValue?.slice(0, 200) ?? null,
  }));
  for (let index = 0; index < rows.length; index += 500) {
    await prisma.importIssue.createMany({ data: rows.slice(index, index + 500) });
  }
}

function countTotals(issues: ImportIssueDraft[], plan: ImportPlan | null): DryRunResult['totals'] {
  return {
    errors: issues.filter((item) => item.severity === 'ERROR').length,
    warnings: issues.filter((item) => item.severity === 'WARNING').length,
    create: plan?.totals.create ?? 0,
    update: plan?.totals.update ?? 0,
    skip: plan?.totals.skip ?? 0,
  };
}

/** List for the Import Center landing page. */
export async function listJobs(page: number, pageSize: number) {
  const [rows, total] = await Promise.all([
    prisma.importJob.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, status: true, fileName: true, mode: true, createdAt: true, finishedAt: true,
        stats: true, options: true, createdById: true,
        _count: { select: { issues: { where: { severity: 'ERROR' } } } },
      },
    }),
    prisma.importJob.count(),
  ]);
  // ImportJob has no createdBy relation (kept lean) — join emails manually.
  const actorIds = [...new Set(rows.map((row) => row.createdById))];
  const actors = actorIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } })
    : [];
  const emailById = new Map(actors.map((actor) => [actor.id, actor.email]));
  const items = rows.map((row) => ({ ...row, createdByEmail: emailById.get(row.createdById) ?? null }));
  return { items, total, page, pageSize };
}

/** Detail with issues (paginated, filterable by severity). */
export async function jobDetail(jobId: string, issuePage: number, issuePageSize: number, severity?: 'ERROR' | 'WARNING') {
  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
    include: {
      _count: { select: { issues: severity === undefined ? true : { where: { severity } } } },
    },
  });
  if (job === null) throw new AppError(ERR.NOT_FOUND, 'Import job not found', 404);
  const actor = await prisma.user.findUnique({ where: { id: job.createdById }, select: { email: true } });
  const issues = await prisma.importIssue.findMany({
    where: { jobId, ...(severity !== undefined ? { severity } : {}) },
    orderBy: [{ rowNumber: 'asc' }, { code: 'asc' }],
    skip: (issuePage - 1) * issuePageSize,
    take: issuePageSize,
  });
  return { job: { ...job, createdByEmail: actor?.email ?? null }, issues };
}

/** Rebuilds the downloadable error report for a job. */
export async function jobErrorReport(jobId: string): Promise<{ buffer: Buffer; fileName: string } | null> {
  const job = await prisma.importJob.findUnique({ where: { id: jobId }, include: { issues: true } });
  if (job === null) return null;
  const extension = job.mode === 'CSV' ? 'csv' : 'xlsx';
  const filePath = path.join(importsDir(), `${job.id}.${extension}`);
  let parsed: ParsedWorkbook = { sheets: {}, unknownColumns: {}, formulaCellCount: 0 };
  try {
    await stat(filePath);
    parsed = job.mode === 'CSV' ? await parseCsv(filePath) : await parseXlsx(filePath);
  } catch {
    // File pruned — the report is rebuilt from the persisted issues only.
  }
  const issues: ImportIssueDraft[] = job.issues.map((item) => ({
    sheet: item.sheet,
    rowNumber: item.rowNumber,
    column: item.column ?? undefined,
    severity: item.severity,
    code: item.code as ImportIssueDraft['code'],
    message: item.message,
    rawValue: item.rawValue ?? undefined,
  }));
  const { generateErrorReport } = await import('./reports/error.report.js');
  const buffer = await generateErrorReport(parsed, issues);
  return { buffer, fileName: `import-errors-${job.id}.xlsx` };
}

/** Reads a stored import file back (used by tests + the report endpoint). */
export async function readJobFile(jobId: string, extension: string): Promise<Buffer> {
  return readFile(path.join(importsDir(), `${jobId}.${extension}`));
}

export type { NormalizedWorkbook, RefContext };
