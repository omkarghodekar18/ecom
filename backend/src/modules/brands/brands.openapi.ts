// OpenAPI registration for the brands module.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import { BrandDtoSchema } from '../../shared/dto/catalog.dto.js';
import { CreateBrandInputSchema, UpdateBrandInputSchema } from './brands.service.js';

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });

const jsonBody = (schema: z.ZodType) => ({ content: { 'application/json': { schema } }, required: true });

const jsonResponse = (description: string, schema?: z.ZodType) => ({
  description,
  ...(schema ? { content: { 'application/json': { schema } } } : {}),
});

const slugParam = z.object({ slug: z.string() });
const idParam = z.object({ id: z.string() });

const notFound = jsonResponse('Brand not found (NOT_FOUND)');
const staffOnlyErrors = {
  '401': jsonResponse('Not authenticated'),
  '403': jsonResponse('Not a STAFF/ADMIN user (FORBIDDEN)'),
};

const brandWithCountSchema = BrandDtoSchema.extend({ productCount: z.number().int() });

openApiRegistry.registerPath({
  method: 'get',
  path: '/brands',
  tags: ['Catalog'],
  description: 'All brands with PUBLISHED product counts (computed via groupBy on Product). Cached 5 min.',
  responses: {
    '200': jsonResponse('Brands with product counts', envelope(z.array(brandWithCountSchema))),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/brands/{slug}',
  tags: ['Catalog'],
  description: 'One brand by slug (logo URL resolved). Product listing by brand lives in the products module.',
  request: { params: slugParam },
  responses: {
    '200': jsonResponse('Brand', envelope(BrandDtoSchema)),
    '404': notFound,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/admin/brands',
  tags: ['Admin'],
  description: 'Creates a brand. Slug defaults to the name with a unique suffix on conflict; name is unique.',
  request: { body: jsonBody(CreateBrandInputSchema) },
  responses: {
    '201': jsonResponse('Created brand', envelope(BrandDtoSchema)),
    '400': jsonResponse('Validation failed'),
    ...staffOnlyErrors,
    '409': jsonResponse('Brand name already in use (CONFLICT)'),
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/admin/brands/{id}',
  tags: ['Admin'],
  description: 'Partial brand update.',
  request: { params: idParam, body: jsonBody(UpdateBrandInputSchema) },
  responses: {
    '200': jsonResponse('Updated brand', envelope(BrandDtoSchema)),
    '400': jsonResponse('Validation failed'),
    ...staffOnlyErrors,
    '404': notFound,
    '409': jsonResponse('Name already in use (CONFLICT)'),
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/admin/brands/{id}',
  tags: ['Admin'],
  description: 'Hard-deletes a brand; 409 CONFLICT while products reference it.',
  request: { params: idParam },
  responses: {
    '204': jsonResponse('Deleted'),
    ...staffOnlyErrors,
    '404': notFound,
    '409': jsonResponse('Still has products (CONFLICT, details { products })'),
  },
});
