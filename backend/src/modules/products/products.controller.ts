// Products controller — validates with the service's zod schemas and delegates
// to products.service; admin handlers resolve the acting user + IP for audit.
// The listing handlers own the rich query-string parsing (page/pageSize/sort/
// inStock/brand/q + free attribute filters) that feeds the service's ListingQuery.
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireUserId } from '../../common/middleware/authenticate.js';
import { buildMeta, parsePagination } from '../../common/pagination.js';
import { ok, okCreated } from '../../common/response/http.js';
import { SortSchema } from '../../shared/dto/product.dto.js';
import type { ListingQuery } from './products.service.js';
import { productsService } from './products.service.js';
import {
  AdminProductListQuerySchema,
  CreateProductInputSchema,
  CreateVariantInputSchema,
  PriceTiersInputSchema,
  ReplaceDocumentsInputSchema,
  ReplaceImagesInputSchema,
  UpdateProductInputSchema,
  UpdateVariantInputSchema,
  BulkUpdateInputSchema,
} from './products.service.js';

const slugParamSchema = z.object({ slug: z.string().min(1) });
const articleNoParamSchema = z.object({ articleNo: z.string().min(1) });
const codeParamSchema = z.object({ code: z.string().min(1) });
const idParamSchema = z.object({ id: z.string().min(1) });
const variantParamsSchema = z.object({ id: z.string().min(1), variantId: z.string().min(1) });

const noContent = (res: Response): void => {
  res.status(204).send();
};

// ── listing query string → ListingQuery ──────────────────────────────────────

/** Query keys the listing consumes itself; every other key is an attribute filter. */
const KNOWN_LISTING_KEYS = new Set(['page', 'pageSize', 'sort', 'inStock', 'brand', 'q']);

const listingOptionsSchema = z.object({
  sort: SortSchema.default('relevance'),
  inStock: z.enum(['true', 'false']).default('false'),
  brand: z.string().trim().max(1000).optional(),
  // Reserved for the Phase-5 text-search integration: parsed so it is never
  // mistaken for an attribute filter, but it does not affect results yet.
  q: z.string().trim().max(200).optional(),
});

/** Query value → plain string; repeated keys behave like comma-joined values. */
function flattenQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const joined = value.filter((v): v is string => typeof v === 'string').join(',');
    return joined.length > 0 ? joined : undefined;
  }
  return undefined;
}

/**
 * Builds the service's ListingQuery from the raw query string: pagination,
 * sort, inStock flag and the brand-slug list are parsed here; every OTHER key
 * is passed through as a raw attribute filter (`key=v1,v2`, `key_min`,
 * `key_max`) for the service to validate against the category's effective
 * attribute mapping (unknown keys → 400 with details).
 */
export function parseListingQuery(raw: Request['query']): ListingQuery {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const flattened = flattenQueryValue(value);
    if (flattened !== undefined) params[key] = flattened;
  }
  const page = parsePagination(params);
  const options = listingOptionsSchema.parse({
    sort: params.sort,
    inStock: params.inStock,
    brand: params.brand,
    q: params.q,
  });
  const attributeFilters: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!KNOWN_LISTING_KEYS.has(key)) attributeFilters[key] = value;
  }
  return {
    page: page.page,
    pageSize: page.pageSize,
    skip: page.skip,
    take: page.take,
    sort: options.sort,
    inStock: options.inStock === 'true',
    brandSlugs:
      options.brand !== undefined
        ? options.brand
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : [],
    attributeFilters,
  };
}

/** Products endpoint handlers — plain async functions; routes wrap them with asyncHandler. */
export const productsController = {
  // ── public reads (spec 15.4/15.5) ──

  async detailBySlug(req: Request, res: Response): Promise<void> {
    const { slug } = slugParamSchema.parse(req.params);
    ok(res, await productsService.detailBySlug(slug));
  },

  async variantByArticleNo(req: Request, res: Response): Promise<void> {
    const { articleNo } = articleNoParamSchema.parse(req.params);
    ok(res, await productsService.variantByArticleNo(articleNo));
  },

  /** GET /products/:slug/related — same category, same brand preferred. */
  async relatedProducts(req: Request, res: Response): Promise<void> {
    const { slug } = slugParamSchema.parse(req.params);
    ok(res, await productsService.relatedProducts(slug));
  },

  /** GET /categories/:code/products — subtree listing with attribute filters. */
  async listByCategory(req: Request, res: Response): Promise<void> {
    const { code } = codeParamSchema.parse(req.params);
    const query = parseListingQuery(req.query);
    const listing = await productsService.listByCategory(code, query);
    ok(res, listing, buildMeta(listing.total, query.page, query.pageSize));
  },

  /** GET /brands/:slug/products — the same listing scoped to one brand. */
  async listByBrand(req: Request, res: Response): Promise<void> {
    const { slug } = slugParamSchema.parse(req.params);
    const query = parseListingQuery(req.query);
    const listing = await productsService.listByBrand(slug, query);
    ok(res, listing, buildMeta(listing.total, query.page, query.pageSize));
  },

  // ── admin (authenticate + authorize('STAFF','ADMIN') applied on the router) ──

  /** GET /admin/products — search/filter/sort/paginate the back-office table. */
  async adminList(req: Request, res: Response): Promise<void> {
    const query = AdminProductListQuerySchema.parse(req.query);
    const page = parsePagination(req.query);
    const { items, total } = await productsService.adminList(query, page);
    ok(res, items, buildMeta(total, page.page, page.pageSize));
  },

  /** GET /admin/products/:id — admin detail (incl. DRAFT/ARCHIVED). */
  async adminDetail(req: Request, res: Response): Promise<void> {
    ok(res, await productsService.adminDetail(String(req.params.id)));
  },

  async createProduct(req: Request, res: Response): Promise<void> {
    const input = CreateProductInputSchema.parse(req.body);
    okCreated(res, await productsService.createProduct(requireUserId(req), input, req.ip ?? null));
  },

  async updateProduct(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = UpdateProductInputSchema.parse(req.body);
    ok(res, await productsService.updateProduct(requireUserId(req), id, input, req.ip ?? null));
  },

  async deleteProduct(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await productsService.deleteProduct(requireUserId(req), id, req.ip ?? null);
    noContent(res);
  },

  async bulkUpdateProducts(req: Request, res: Response): Promise<void> {
    const input = BulkUpdateInputSchema.parse(req.body);
    ok(res, await productsService.bulkUpdate(requireUserId(req), input, req.ip ?? null));
  },

  async duplicateProduct(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    okCreated(res, await productsService.duplicateProduct(requireUserId(req), id, req.ip ?? null));
  },

  async createVariant(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = CreateVariantInputSchema.parse(req.body);
    okCreated(res, await productsService.createVariant(requireUserId(req), id, input, req.ip ?? null));
  },

  async updateVariant(req: Request, res: Response): Promise<void> {
    const { id, variantId } = variantParamsSchema.parse(req.params);
    const input = UpdateVariantInputSchema.parse(req.body);
    ok(res, await productsService.updateVariant(requireUserId(req), id, variantId, input, req.ip ?? null));
  },

  async deleteVariant(req: Request, res: Response): Promise<void> {
    const { id, variantId } = variantParamsSchema.parse(req.params);
    await productsService.deleteVariant(requireUserId(req), id, variantId, req.ip ?? null);
    noContent(res);
  },

  /** PUT /admin/products/:id/images — REPLACES the image list. */
  async replaceImages(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const items = ReplaceImagesInputSchema.parse(req.body);
    ok(res, await productsService.replaceImages(requireUserId(req), id, items, req.ip ?? null));
  },

  /** POST /admin/products/:id/documents — REPLACES the document list. */
  async replaceDocuments(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const items = ReplaceDocumentsInputSchema.parse(req.body);
    ok(res, await productsService.replaceDocuments(requireUserId(req), id, items, req.ip ?? null));
  },

  /** PUT /admin/products/:id/price-tiers/:variantId — REPLACES the tier list. */
  async replacePriceTiers(req: Request, res: Response): Promise<void> {
    const { id, variantId } = variantParamsSchema.parse(req.params);
    const tiers = PriceTiersInputSchema.parse(req.body);
    ok(res, await productsService.replacePriceTiers(requireUserId(req), id, variantId, tiers, req.ip ?? null));
  },
};
