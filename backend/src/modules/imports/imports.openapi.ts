// Imports OpenAPI registration (spec 20): documents the Import Center
// endpoints. The xlsx downloads use binary responses; the upload takes a
// base64 JSON body.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });
const guarded = {
  '401': { description: 'Authentication required' },
  '403': { description: 'Role not permitted (STAFF/ADMIN only; rollback ADMIN)' },
} as const;

const ImportOptionsSchema = z.object({
  onDuplicateArticleNo: z.enum(['UPDATE', 'SKIP', 'FAIL']),
  createMissingBrands: z.boolean(),
  publishStatus: z.enum(['DRAFT', 'PUBLISHED']),
  strictImages: z.boolean(),
});

const ImportJobSchema = z.object({
  id: z.string(),
  status: z.enum(['UPLOADED', 'PARSING', 'VALIDATING', 'VALIDATED_WITH_ERRORS', 'READY_TO_COMMIT', 'COMMITTING', 'COMPLETED', 'FAILED', 'ROLLED_BACK', 'CANCELLED']),
  fileName: z.string(),
  mode: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  stats: z.object({ errors: z.number(), warnings: z.number(), create: z.number(), update: z.number(), skip: z.number() }).partial().nullable(),
  createdByEmail: z.string().nullable(),
  _count: z.object({ issues: z.number() }),
});

const ImportIssueSchema = z.object({
  sheet: z.string(),
  rowNumber: z.number(),
  column: z.string().nullable(),
  severity: z.enum(['ERROR', 'WARNING']),
  code: z.string(),
  message: z.string(),
  rawValue: z.string().nullable(),
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/v1/admin/imports',
  tags: ['admin-imports'],
  summary: 'Upload an import file (dry run starts automatically)',
  description: 'Uploads a `.xlsx` (≤ 25 MB, ≤ 50k variant rows) or a flat `.csv` as base64. The dry run (validation) runs on the queue — poll the job detail for the report. Options control duplicate policy, brand creation, publish status and strict images.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            fileName: z.string(),
            contentBase64: z.string(),
            mode: z.enum(['XLSX', 'CSV']),
            options: ImportOptionsSchema.partial().optional(),
          }),
        },
      },
    },
  },
  responses: {
    '201': { description: 'Job created; dry run enqueued', content: { 'application/json': { schema: envelope(z.object({ jobId: z.string() })) } } },
    ...guarded,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/admin/imports',
  tags: ['admin-imports'],
  summary: 'List import jobs',
  responses: {
    '200': { description: 'Paginated job list', content: { 'application/json': { schema: envelope(z.array(ImportJobSchema)) } } },
    ...guarded,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/admin/imports/template',
  tags: ['admin-imports'],
  summary: 'Download the .xlsx template',
  description: 'Generates a template workbook (README sheet, dropdowns, example row). `categoryCode` pre-fills the category\'s `attr:` columns with enum validations.',
  request: { query: z.object({ categoryCode: z.string().optional() }) },
  responses: {
    '200': { description: 'Template workbook (.xlsx binary)' },
    ...guarded,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/admin/imports/{id}',
  tags: ['admin-imports'],
  summary: 'Import job detail with the validation report',
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({ issuePage: z.coerce.number().int().min(1).default(1), issuePageSize: z.coerce.number().int().min(1).max(200).default(50), severity: z.enum(['ERROR', 'WARNING']).optional() }),
  },
  responses: {
    '200': { description: 'Job + paginated issues', content: { 'application/json': { schema: envelope(z.object({ job: ImportJobSchema, issues: z.array(ImportIssueSchema) })) } } },
    ...guarded,
    '404': { description: 'Job not found' },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/admin/imports/{id}/report',
  tags: ['admin-imports'],
  summary: 'Download the error report (.xlsx)',
  description: 'Original rows with an appended Errors column plus a per-code summary sheet.',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    '200': { description: 'Error report workbook (.xlsx binary)' },
    ...guarded,
    '404': { description: 'Job not found' },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/v1/admin/imports/{id}/commit',
  tags: ['admin-imports'],
  summary: 'Commit a validated import (STAFF/ADMIN)',
  description: 'Only allowed when the dry run has zero errors. Runs in batches of 500 rows per transaction with progress on the job stats; only one commit may run at a time.',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    '200': { description: 'Commit enqueued/started', content: { 'application/json': { schema: envelope(z.object({ queued: z.boolean() })) } } },
    '409': { description: 'Not READY_TO_COMMIT or another commit is running' },
    ...guarded,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/v1/admin/imports/{id}/rollback',
  tags: ['admin-imports'],
  summary: 'Roll back a completed import (ADMIN only)',
  description: 'Restores every ImportBatchItem previous state in reverse order. Refused when a newer completed import exists (out-of-order rollback).',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    '200': { description: 'Rollback result', content: { 'application/json': { schema: envelope(z.object({ restored: z.number() })) } } },
    '403': { description: 'ADMIN role required' },
    '409': { description: 'Job not COMPLETED or newer import exists' },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/v1/admin/imports/{id}/cancel',
  tags: ['admin-imports'],
  summary: 'Cancel an unfinished import job',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    '200': { description: 'Cancelled', content: { 'application/json': { schema: envelope(z.object({ cancelled: z.boolean() })) } } },
    '409': { description: 'Job already finished' },
    ...guarded,
  },
});
