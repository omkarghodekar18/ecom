// OpenAPI registration for the attributes module.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import { AttributeDtoSchema, CategoryAttributeDtoSchema } from '../../shared/dto/catalog.dto.js';
import {
  CategoryMappingInputSchema,
  CreateAttributeInputSchema,
  UpdateAttributeInputSchema,
} from './attributes.service.js';

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });

const jsonBody = (schema: z.ZodType) => ({ content: { 'application/json': { schema } }, required: true });

const jsonResponse = (description: string, schema?: z.ZodType) => ({
  description,
  ...(schema ? { content: { 'application/json': { schema } } } : {}),
});

const keyParam = z.object({ key: z.string() });
const idParam = z.object({ id: z.string() });

const notFound = jsonResponse('Attribute not found (NOT_FOUND)');
const staffOnlyErrors = {
  '401': jsonResponse('Not authenticated'),
  '403': jsonResponse('Not a STAFF/ADMIN user (FORBIDDEN)'),
};

// ── public reads ─────────────────────────────────────────────────────────────

openApiRegistry.registerPath({
  method: 'get',
  path: '/attributes',
  tags: ['Catalog'],
  description:
    'Attribute definitions (flat, grouped client-side). With ?categoryCode= returns the effective mapped set for that category instead (same inheritance as /categories/{code}/filters).',
  request: { query: z.object({ categoryCode: z.string().optional() }) },
  responses: {
    '200': jsonResponse('Attributes', envelope(z.array(AttributeDtoSchema.or(CategoryAttributeDtoSchema)))),
    '404': jsonResponse('Category not found (with categoryCode)'),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/attributes/{key}',
  tags: ['Catalog'],
  description: 'One attribute definition by key.',
  request: { params: keyParam },
  responses: {
    '200': jsonResponse('Attribute', envelope(AttributeDtoSchema)),
    '404': notFound,
  },
});

// ── admin writes ─────────────────────────────────────────────────────────────

openApiRegistry.registerPath({
  method: 'post',
  path: '/admin/attributes',
  tags: ['Admin'],
  description:
    'Creates an attribute definition. ENUM requires a non-empty, duplicate-free enumValues array.',
  request: { body: jsonBody(CreateAttributeInputSchema) },
  responses: {
    '201': jsonResponse('Created attribute', envelope(AttributeDtoSchema)),
    '400': jsonResponse('Validation failed (key slug, ENUM rules)'),
    ...staffOnlyErrors,
    '409': jsonResponse('Attribute key already in use (CONFLICT)'),
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/admin/attributes/{id}',
  tags: ['Admin'],
  description:
    'Updates label/labelHtml/groupName/unit/enumValues and (guarded) type. Type changes return 409 CONFLICT while product variant values reference the attribute.',
  request: { params: idParam, body: jsonBody(UpdateAttributeInputSchema) },
  responses: {
    '200': jsonResponse('Updated attribute', envelope(AttributeDtoSchema)),
    '400': jsonResponse('Validation failed (ENUM rules)'),
    ...staffOnlyErrors,
    '404': notFound,
    '409': jsonResponse('Type locked by existing values (CONFLICT)'),
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/admin/attributes/{id}',
  tags: ['Admin'],
  description: 'Hard-deletes an attribute; 409 CONFLICT while categories or product values reference it.',
  request: { params: idParam },
  responses: {
    '204': jsonResponse('Deleted'),
    ...staffOnlyErrors,
    '404': notFound,
    '409': jsonResponse('Still referenced (CONFLICT, details { mappings, values })'),
  },
});

openApiRegistry.registerPath({
  method: 'put',
  path: '/admin/categories/{id}/attributes',
  tags: ['Admin'],
  description:
    'REPLACES the category’s attribute mapping with the request array (deleteMany + createMany in one transaction). isVariantAxis requires STRING/ENUM attributes. Body is the bare array.',
  request: { params: idParam, body: jsonBody(CategoryMappingInputSchema) },
  responses: {
    '200': jsonResponse('New mapping', envelope(z.array(CategoryAttributeDtoSchema))),
    '400': jsonResponse('Validation failed (unknown/duplicate attributeIds, variant-axis type)'),
    ...staffOnlyErrors,
    '404': jsonResponse('Category not found'),
  },
});
