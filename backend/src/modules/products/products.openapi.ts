// OpenAPI registration for the products module.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import {
  DocumentDtoSchema,
  ImageDtoSchema,
  ListingProductDtoSchema,
  ListingResponseSchema,
  PriceTierDtoSchema,
  ProductDetailDtoSchema,
  SortSchema,
  VariantDtoSchema,
} from '../../shared/dto/product.dto.js';
import { ProductStatusSchema } from '../../shared/enums.js';
import {
  AdminProductListQuerySchema,
  CreateProductInputSchema,
  CreateVariantInputSchema,
  PriceTiersInputSchema,
  ReplaceDocumentsInputSchema,
  ReplaceImagesInputSchema,
  UpdateProductInputSchema,
  UpdateVariantInputSchema,
} from './products.service.js';

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });

const pageMeta = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

const paginated = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data, meta: pageMeta });

const jsonBody = (schema: z.ZodType) => ({ content: { 'application/json': { schema } }, required: true });

const jsonResponse = (description: string, schema?: z.ZodType) => ({
  description,
  ...(schema ? { content: { 'application/json': { schema } } } : {}),
});

const slugParam = z.object({ slug: z.string() });
const articleNoParam = z.object({ articleNo: z.string() });
const codeParam = z.object({ code: z.string() });
const idParam = z.object({ id: z.string() });
const variantParams = z.object({ id: z.string(), variantId: z.string() });

const notFoundProduct = jsonResponse('Product/variant not found (NOT_FOUND)');
const staffOnlyErrors = {
  '401': jsonResponse('Not authenticated'),
  '403': jsonResponse('Not a STAFF/ADMIN user (FORBIDDEN)'),
};

// ── listing query (shared by category and brand listings) ────────────────────

/**
 * Documented portion of the rich listing query. Beyond these keys, EVERY other
 * query parameter is an attribute filter: `key=v1,v2` (STRING/ENUM/BOOLEAN),
 * `key_min`/`key_max` (NUMBER ranges) — validated against the category's
 * effective attribute mapping; unknown keys → 400 with details.
 */
const listingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sort: SortSchema.optional(),
  inStock: z.enum(['true', 'false']).optional(),
  brand: z.string().optional(),
  q: z.string().optional(),
});

const listingDescription =
  'Paginated listing (default sort `relevance` ≙ newest-first) with DISJUNCTIVE ' +
  'facet counts (`facets`). Any OTHER query key is an attribute filter: `key=v1,v2` ' +
  'for STRING/ENUM (OR inside the value set), `true`/`false` for BOOLEAN, and ' +
  '`key_min`/`key_max` for inclusive NUMBER ranges — AND across attributes, and ' +
  'a product matches when ONE active variant matches ALL predicates. `q` is ' +
  'parsed but ignored here — ranked full-text search lives at `GET /search`.';

const adminListQuerySchema = AdminProductListQuerySchema.extend({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

// ── admin response shapes (service returns plain DTOs; mirrored here) ────────

const adminProductSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: ProductStatusSchema,
  isBestseller: z.boolean(),
  brandId: z.string(),
  brandName: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  shortDescription: z.string().nullable(),
  descriptionHtml: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  minPrice: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const adminProductListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: ProductStatusSchema,
  brandName: z.string(),
  categoryName: z.string(),
  variantCount: z.number().int(),
  minPrice: z.string().nullable(),
  imageCount: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// ── public reads ─────────────────────────────────────────────────────────────

openApiRegistry.registerPath({
  method: 'get',
  path: '/products/{slug}',
  tags: ['Products'],
  description:
    'PDP payload by slug — PUBLISHED, non-deleted products only (else 404). Carries brand, category path, ordered images/documents and the active variants with attribute values, price tiers and availability.',
  request: { params: slugParam },
  responses: {
    '200': jsonResponse('Product detail', envelope(ProductDetailDtoSchema)),
    '404': notFoundProduct,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/variants/{articleNo}',
  tags: ['Products'],
  description: 'One variant by exact articleNo (public visibility rules apply, else 404) — cart/PDP deep links.',
  request: { params: articleNoParam },
  responses: {
    '200': jsonResponse('Variant', envelope(VariantDtoSchema)),
    '404': notFoundProduct,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/products/{slug}/related',
  tags: ['Products'],
  description: 'Up to 8 related PUBLISHED products from the same category (same brand preferred, self excluded).',
  request: { params: slugParam },
  responses: {
    '200': jsonResponse('Related products', envelope(z.array(ListingProductDtoSchema))),
    '404': notFoundProduct,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/categories/{code}/products',
  tags: ['Products'],
  description: listingDescription,
  request: { params: codeParam, query: listingQuerySchema },
  responses: {
    '200': jsonResponse('Listing page', paginated(ListingResponseSchema)),
    '400': jsonResponse('Invalid filter parameter(s) — unknown keys or type misuse, details included'),
    '404': jsonResponse('Category not found'),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/brands/{slug}/products',
  tags: ['Products'],
  description: listingDescription + ' The scope is fixed to the brand; the `brand` filter key is ignored here.',
  request: { params: slugParam, query: listingQuerySchema },
  responses: {
    '200': jsonResponse('Listing page', paginated(ListingResponseSchema)),
    '400': jsonResponse('Invalid filter parameter(s) — unknown keys or type misuse, details included'),
    '404': jsonResponse('Brand not found'),
  },
});

// ── admin: product CRUD ──────────────────────────────────────────────────────

openApiRegistry.registerPath({
  method: 'get',
  path: '/admin/products',
  tags: ['Admin'],
  description: 'Back-office product table: search (name/articleNo prefix), brand/category/status/low-stock filters, sort and pagination.',
  request: { query: adminListQuerySchema },
  responses: {
    '200': jsonResponse('Product rows', paginated(z.array(adminProductListItemSchema))),
    ...staffOnlyErrors,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/admin/products',
  tags: ['Admin'],
  description:
    'Creates a product family. Slug defaults to the name (unique suffix on conflict); the category must exist, be active and be a leaf; the brand must exist. Audited.',
  request: { body: jsonBody(CreateProductInputSchema) },
  responses: {
    '201': jsonResponse('Created product', envelope(adminProductSchema)),
    '400': jsonResponse('Validation failed'),
    ...staffOnlyErrors,
    '404': jsonResponse('Brand/category not found'),
    '409': jsonResponse('Could not derive a unique slug (CONFLICT)'),
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/admin/products/{id}',
  tags: ['Admin'],
  description:
    'Partial product update. A slug change writes a PRODUCT SlugRedirect (old → new). descriptionHtml is sanitized; audited with a field-level diff.',
  request: { params: idParam, body: jsonBody(UpdateProductInputSchema) },
  responses: {
    '200': jsonResponse('Updated product', envelope(adminProductSchema)),
    '400': jsonResponse('Validation failed (leaf-category policy, unknown brand/category)'),
    ...staffOnlyErrors,
    '404': notFoundProduct,
    '409': jsonResponse('Slug derivation exhausted (CONFLICT)'),
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/admin/products/{id}',
  tags: ['Admin'],
  description: 'Soft-deletes the product AND its variants (minPrice cleared). 409 when already deleted.',
  request: { params: idParam },
  responses: {
    '204': jsonResponse('Deleted'),
    ...staffOnlyErrors,
    '404': notFoundProduct,
    '409': jsonResponse('Already deleted (CONFLICT)'),
  },
});

// ── admin: variants ──────────────────────────────────────────────────────────

openApiRegistry.registerPath({
  method: 'post',
  path: '/admin/products/{id}/variants',
  tags: ['Admin'],
  description:
    'Creates a variant + attribute values and recomputes product.minPrice in one transaction. articleNo/EAN must be unique; attribute values must satisfy the category mapping; variant-axis combinations must not collide (409 with the conflicting variant).',
  request: { params: idParam, body: jsonBody(CreateVariantInputSchema) },
  responses: {
    '201': jsonResponse('Created variant', envelope(VariantDtoSchema)),
    '400': jsonResponse('Validation failed (mapping, required attributes, lead time)'),
    ...staffOnlyErrors,
    '404': notFoundProduct,
    '409': jsonResponse('articleNo/ean/axis combination already in use (CONFLICT, details included)'),
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/admin/products/{id}/variants/{variantId}',
  tags: ['Admin'],
  description:
    'Partial variant update. `attributes` (when present) merge-replaces the stored values; the final set must satisfy the mapping. minPrice is recomputed. Audited with a field-level diff.',
  request: { params: variantParams, body: jsonBody(UpdateVariantInputSchema) },
  responses: {
    '200': jsonResponse('Updated variant', envelope(VariantDtoSchema)),
    '400': jsonResponse('Validation failed (mapping, required attributes, lead time)'),
    ...staffOnlyErrors,
    '404': jsonResponse('Product or variant not found'),
    '409': jsonResponse('articleNo/ean/axis combination already in use (CONFLICT, details included)'),
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/admin/products/{id}/variants/{variantId}',
  tags: ['Admin'],
  description: 'Soft-deletes a variant; the last active variant of a product cannot be deleted (409).',
  request: { params: variantParams },
  responses: {
    '204': jsonResponse('Deleted'),
    ...staffOnlyErrors,
    '404': jsonResponse('Product or variant not found'),
    '409': jsonResponse('Last active variant (CONFLICT)'),
  },
});

// ── admin: image / document / price-tier lists ───────────────────────────────

openApiRegistry.registerPath({
  method: 'put',
  path: '/admin/products/{id}/images',
  tags: ['Admin'],
  description:
    'REPLACES the image list (body = bare array). publicIds must be valid media ids; variantId references must belong to this product. Responds with the new list in display order.',
  request: { params: idParam, body: jsonBody(ReplaceImagesInputSchema) },
  responses: {
    '200': jsonResponse('New image list', envelope(z.array(ImageDtoSchema))),
    '400': jsonResponse('Validation failed (publicIds, foreign variantId)'),
    ...staffOnlyErrors,
    '404': notFoundProduct,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/admin/products/{id}/documents',
  tags: ['Admin'],
  description:
    'REPLACES the document list (body = bare array, same semantics as the images PUT). Entries with a publicId resolve to /media/{publicId}; otherwise the url must be an absolute http(s) URL.',
  request: { params: idParam, body: jsonBody(ReplaceDocumentsInputSchema) },
  responses: {
    '200': jsonResponse('New document list', envelope(z.array(DocumentDtoSchema))),
    '400': jsonResponse('Validation failed (publicId, relative url)'),
    ...staffOnlyErrors,
    '404': notFoundProduct,
  },
});

openApiRegistry.registerPath({
  method: 'put',
  path: '/admin/products/{id}/price-tiers/{variantId}',
  tags: ['Admin'],
  description:
    'REPLACES the variant’s tier price list (body = bare array; quantities strictly increasing). Responds with the new tiers.',
  request: { params: variantParams, body: jsonBody(PriceTiersInputSchema) },
  responses: {
    '200': jsonResponse('New price tiers', envelope(z.array(PriceTierDtoSchema))),
    '400': jsonResponse('Tier quantities must be strictly increasing'),
    ...staffOnlyErrors,
    '404': jsonResponse('Product or variant not found'),
  },
});
