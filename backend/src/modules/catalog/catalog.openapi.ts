// OpenAPI registration for the catalog module.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import {
  CategoryAttributeDtoSchema,
  CategoryDtoSchema,
  CrumbDtoSchema,
} from '../../shared/dto/catalog.dto.js';
import {
  CreateCategoryInputSchema,
  MoveCategoryInputSchema,
  ReorderCategoryInputSchema,
  UpdateCategoryInputSchema,
} from './catalog.service.js';

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });

const jsonBody = (schema: z.ZodType) => ({ content: { 'application/json': { schema } }, required: true });

const jsonResponse = (description: string, schema?: z.ZodType) => ({
  description,
  ...(schema ? { content: { 'application/json': { schema } } } : {}),
});

const codeParam = z.object({ code: z.string() });
const idParam = z.object({ id: z.string() });

const notFound = jsonResponse('Category not found (NOT_FOUND)');
const staffOnlyErrors = {
  '401': jsonResponse('Not authenticated'),
  '403': jsonResponse('Not a STAFF/ADMIN user (FORBIDDEN)'),
};

const categoryDetailSchema = CategoryDtoSchema.extend({
  path: z.string(),
  children: z.array(CategoryDtoSchema),
});

// Docs-only shape for the navigation tree. The runtime DTO (NavigationNodeDto)
// is infinitely recursive; this generator major cannot express z.lazy cycles,
// so the documentation models three concrete levels and marks deeper children
// generically. Runtime validation/types are unaffected.
const navigationNodeDoc = (children: z.ZodType) =>
  z.object({
    id: z.string(),
    code: z.string(),
    slug: z.string(),
    name: z.string(),
    level: z.number().int(),
    productCount: z.number().int(),
    icon: z.string().nullable(),
    children,
  });
const navigationDoc = navigationNodeDoc(
  z.array(navigationNodeDoc(z.array(navigationNodeDoc(z.array(z.unknown()))))),
);

// ── public reads ─────────────────────────────────────────────────────────────

openApiRegistry.registerPath({
  method: 'get',
  path: '/navigation/tree',
  tags: ['Catalog'],
  description: 'Navigation tree of active categories, `depth` levels deep (default 2, max 10). Cached 5 min.',
  request: { query: z.object({ depth: z.coerce.number().int().min(1).max(10).default(2) }) },
  responses: {
    '200': jsonResponse('Navigation nodes with subtree productCount', envelope(z.array(navigationDoc))),
    '400': jsonResponse('Invalid depth'),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/categories/{code}',
  tags: ['Catalog'],
  description: 'One active category by code, plus its immediate active children.',
  request: { params: codeParam },
  responses: {
    '200': jsonResponse('Category detail', envelope(categoryDetailSchema)),
    '404': notFound,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/categories/{code}/children',
  tags: ['Catalog'],
  description: 'Immediate active children of a category, ordered by sortOrder.',
  request: { params: codeParam },
  responses: {
    '200': jsonResponse('Child categories', envelope(z.array(CategoryDtoSchema))),
    '404': notFound,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/categories/{code}/filters',
  tags: ['Catalog'],
  description:
    'Filterable attribute set for a category: its own mapping, or the nearest ancestor mapping (spec 15.3 inheritance).',
  request: { params: codeParam },
  responses: {
    '200': jsonResponse('Effective attribute mapping', envelope(z.array(CategoryAttributeDtoSchema))),
    '404': notFound,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/categories/{code}/breadcrumb',
  tags: ['Catalog'],
  description: 'Category chain from the root down to (and including) this category.',
  request: { params: codeParam },
  responses: {
    '200': jsonResponse('Breadcrumb crumbs, root first', envelope(z.array(CrumbDtoSchema))),
    '404': notFound,
  },
});

// ── admin writes ─────────────────────────────────────────────────────────────

openApiRegistry.registerPath({
  method: 'post',
  path: '/admin/categories',
  tags: ['Admin'],
  description:
    'Creates a category (root when parentId is null). Computes path/pathSlugs/level from the parent in one transaction; slug defaults to the name with a unique suffix on conflict.',
  request: { body: jsonBody(CreateCategoryInputSchema) },
  responses: {
    '201': jsonResponse('Created category', envelope(categoryDetailSchema)),
    '400': jsonResponse('Validation failed (code pattern NN-NN…)'),
    '401': staffOnlyErrors['401'],
    '403': staffOnlyErrors['403'],
    '404': jsonResponse('Parent category not found'),
    '409': jsonResponse('Category code already in use (CONFLICT)'),
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/admin/categories/reorder',
  tags: ['Admin'],
  description: 'Applies sibling sortOrders in one transaction. parentId (when present) must match the current parent.',
  request: { body: jsonBody(ReorderCategoryInputSchema) },
  responses: {
    '204': jsonResponse('Reordered'),
    ...staffOnlyErrors,
    '400': jsonResponse('Validation failed / parent mismatch'),
    '404': jsonResponse('Category not found'),
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/admin/categories/move',
  tags: ['Admin'],
  description:
    'Re-parents a category and recomputes path/pathSlugs/level for the whole moved subtree atomically. Moving under itself or a descendant returns 400 VALIDATION_ERROR.',
  request: { body: jsonBody(MoveCategoryInputSchema) },
  responses: {
    '200': jsonResponse('Moved category', envelope(categoryDetailSchema)),
    ...staffOnlyErrors,
    '400': jsonResponse('Move under own descendant (VALIDATION_ERROR)'),
    '404': jsonResponse('Category or new parent not found'),
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/admin/categories/{id}',
  tags: ['Admin'],
  description:
    'Partial update. A slug change rewrites pathSlugs for the whole subtree and records CATEGORY SlugRedirect rows (old→new) in the same transaction.',
  request: { params: idParam, body: jsonBody(UpdateCategoryInputSchema) },
  responses: {
    '200': jsonResponse('Updated category', envelope(categoryDetailSchema)),
    ...staffOnlyErrors,
    '400': jsonResponse('Validation failed'),
    '404': jsonResponse('Category not found'),
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/admin/categories/{id}',
  tags: ['Admin'],
  description: 'Soft-deletes a category; 409 CONFLICT while products or child categories exist.',
  request: { params: idParam },
  responses: {
    '204': jsonResponse('Soft-deleted'),
    ...staffOnlyErrors,
    '404': jsonResponse('Category not found'),
    '409': jsonResponse('Still has products/children (CONFLICT, details { products, children })'),
  },
});
