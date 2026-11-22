// OpenAPI registration for the cms module.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import {
  BannerDtoSchema,
  BannerPlacementSchema,
  CmsPageDtoSchema,
  HomeDtoSchema,
} from '../../shared/dto/cms.dto.js';
import {
  CreateBannerInputSchema,
  SaveCmsPageInputSchema,
  UpdateBannerInputSchema,
  UpdateCmsPageInputSchema,
} from './cms.service.js';

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });

const jsonBody = (schema: z.ZodType) => ({ content: { 'application/json': { schema } }, required: true });

const jsonResponse = (description: string, schema?: z.ZodType) => ({
  description,
  ...(schema ? { content: { 'application/json': { schema } } } : {}),
});

const slugParam = z.object({ slug: z.string() });
const idParam = z.object({ id: z.string() });

const notFound = jsonResponse('Not found (NOT_FOUND)');
const staffOnlyErrors = {
  '401': jsonResponse('Not authenticated'),
  '403': jsonResponse('Not a STAFF/ADMIN user (FORBIDDEN)'),
};

// ── public reads ─────────────────────────────────────────────────────────────

openApiRegistry.registerPath({
  method: 'get',
  path: '/cms/home',
  tags: ['CMS'],
  description:
    'Homepage composition: active banners per placement (heroes, side top/bottom, highlights — ' +
    'scheduling window respected), the top-level category tiles and homepage SEO. ' +
    'Cached 5 min under `cms:home`; every admin CMS write invalidates the `cms:` prefix.',
  responses: {
    '200': jsonResponse('Home payload', envelope(HomeDtoSchema)),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/cms/pages/{slug}',
  tags: ['CMS'],
  description:
    'One PUBLISHED CMS page by slug; drafts 404 like unknown slugs. Blocks are validated against ' +
    'the six-type registry on read — unknown or malformed blocks are dropped and logged (spec 6.11), never a 500.',
  request: { params: slugParam },
  responses: {
    '200': jsonResponse('CMS page with parsed blocks', envelope(CmsPageDtoSchema)),
    '404': notFound,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/banners',
  tags: ['CMS'],
  description:
    'Active banners of one placement (scheduling window respected when set), ordered by sortOrder. ' +
    'Banner images resolve to `/media/{publicId}` URLs — the raw publicId never leaves the API.',
  request: { query: z.object({ placement: BannerPlacementSchema }) },
  responses: {
    '200': jsonResponse('Banners', envelope(z.array(BannerDtoSchema))),
    '400': jsonResponse('Missing/unknown placement'),
  },
});

// ── admin: banners ───────────────────────────────────────────────────────────

openApiRegistry.registerPath({
  method: 'post',
  path: '/admin/banners',
  tags: ['Admin'],
  description: 'Creates a banner. `startsAt`/`endsAt` are optional (null = unbounded); audit + `cms:` cache invalidation.',
  request: { body: jsonBody(CreateBannerInputSchema) },
  responses: {
    '201': jsonResponse('Created banner', envelope(BannerDtoSchema)),
    '400': jsonResponse('Validation failed'),
    ...staffOnlyErrors,
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/admin/banners/{id}',
  tags: ['Admin'],
  description: 'Partial banner update with a field-level audit diff.',
  request: { params: idParam, body: jsonBody(UpdateBannerInputSchema) },
  responses: {
    '200': jsonResponse('Updated banner', envelope(BannerDtoSchema)),
    '400': jsonResponse('Validation failed'),
    ...staffOnlyErrors,
    '404': notFound,
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/admin/banners/{id}',
  tags: ['Admin'],
  description: 'Hard-deletes a banner (the model has no soft-delete columns).',
  request: { params: idParam },
  responses: {
    '204': jsonResponse('Deleted'),
    ...staffOnlyErrors,
    '404': notFound,
  },
});

// ── admin: CMS pages ─────────────────────────────────────────────────────────

openApiRegistry.registerPath({
  method: 'post',
  path: '/admin/cms/pages',
  tags: ['Admin'],
  description:
    'Upserts a CMS page by slug: 201 when created, 200 when an existing slug was updated. ' +
    'Every block must match the six-type registry (CmsBlockSchema) — unknown types are rejected with 400 here ' +
    '(the read side drops them instead).',
  request: { body: jsonBody(SaveCmsPageInputSchema) },
  responses: {
    '200': jsonResponse('Updated existing page', envelope(CmsPageDtoSchema)),
    '201': jsonResponse('Created page', envelope(CmsPageDtoSchema)),
    '400': jsonResponse('Validation failed (bad slug or a block outside the registry)'),
    ...staffOnlyErrors,
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/admin/cms/pages/{slug}',
  tags: ['Admin'],
  description:
    'Partial CMS page update by slug (title/blocks/seoTitle/seoDescription/status). ' +
    'Setting status to DRAFT immediately hides the page from the public endpoint.',
  request: { params: slugParam, body: jsonBody(UpdateCmsPageInputSchema) },
  responses: {
    '200': jsonResponse('Updated page', envelope(CmsPageDtoSchema)),
    '400': jsonResponse('Validation failed'),
    ...staffOnlyErrors,
    '404': notFound,
  },
});

