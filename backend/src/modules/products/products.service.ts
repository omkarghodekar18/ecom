// Products service — public reads (PDP by slug, variant by articleNo,
// category/brand listings with attribute filters, related products) plus
// admin product/variant CRUD with audit + catalog post-write hooks.
//
// Listing semantics (spec 15.4/15.5):
//   • a product matches an attribute filter when ANY ONE of its active
//     variants matches ALL predicates (AND across attributes, OR inside one
//     attribute's value set) — implemented as a two-step query (candidate
//     ids by base filters, then a per-variant predicate query);
//   • relevance (default) falls back to a stable createdAt-desc order in the
//     category/brand listings (text search orders by its own score);
//   • the response carries DISJUNCTIVE facet counts (spec 12, computeFacets).
//
// Every admin write: zod-validated, transactional where multi-row, audited
// (`product.*` / `variant`), and followed by afterCatalogWrite() (nav cache
// invalidation + subtree product-count refresh).
import { z, type ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { badRequest, conflict, notFound } from '../../common/errors/app-error.js';
import { slugify } from '../../common/utils/slug.util.js';
import { sanitizeDescriptionHtml } from '../../common/utils/html-sanitize.util.js';
import { withTransaction } from '../../db/transaction.js';
import type { Transaction } from '../../db/transaction-types.js';
import { writeAudit } from '../../services/audit/index.js';
import { isValidPublicId } from '../../services/media/public-id.util.js';
import type { CrumbDto } from '../../shared/dto/catalog.dto.js';
import type { CategoryAttributeDto } from '../../shared/dto/catalog.dto.js';
import type {
  FacetDto,
  ImageDto,
  ListingProductDto,
  ListingResponse,
  PriceTierDto,
  ProductDetailDto,
  Sort,
  VariantAttributes,
  VariantDto,
} from '../../shared/dto/product.dto.js';
import { DocKindSchema, ImageKindSchema, ProductStatusSchema } from '../../shared/enums.js';
import { afterCatalogWrite, catalogRepository } from '../catalog/index.js';
import { scheduleRevalidate, TAGS } from '../../services/revalidate/index.js';
import type { CategoryRow } from '../catalog/index.js';
import { attributesService } from '../attributes/index.js';
import { brandsRepository } from '../brands/index.js';
import { recomputeProductMinPrice, productsRepository, type AttributePredicate, type FacetValueRow } from './products.repository.js';
import type {
  AdminProductListRow,
  AdminProductRow,
  ProductListRow,
  VariantDetailRow,
} from './products.repository.js';
import {
  attributesMap,
  toCrumbs,
  toDetailDto,
  toImageDtos,
  toListingDto,
  toVariantDto,
} from './products.mapper.js';
import { mediaUrl } from '../catalog/public-id.util.js';

/** One value/count pair (the shared DTO exports the schema; derive the type). */
type FacetValueDto = FacetDto['values'][number];

// ── policy constants ────────────────────────────────────────────────────────

/**
 * Spec 16.3 makes "products only in leaf categories" a configurable setting;
 * until the admin Settings section ships, it is fixed here. Flip to true
 * (or read from the settings service) when that UI exists.
 */
const ALLOW_NONLEAF_PRODUCTS = false;

/** Related products per PDP (same category, same brand preferred). */
const RELATED_LIMIT = 8;

/** Admin stock filter: "low" = any non-deleted variant below this stock. */
const LOW_STOCK_THRESHOLD = 10;

// ── input contracts (shared/dto is frozen; module-owned schemas live here) ──

const MONEY_REGEX = /^\d+(\.\d{1,2})?$/;
const positivePriceString = z
  .string()
  .regex(MONEY_REGEX, 'price must be a decimal string with at most 2 fraction digits, e.g. "12.50"')
  .refine((v) => new Prisma.Decimal(v).greaterThan(0), 'price must be greater than 0');

export const CreateProductInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().min(1).max(160).optional(),
  brandId: z.string().min(1),
  categoryId: z.string().min(1),
  shortDescription: z.string().max(500).optional().nullable(),
  descriptionHtml: z.string().max(50_000).optional().nullable(),
  status: ProductStatusSchema.default('DRAFT'),
  isBestseller: z.boolean().default(false),
  seoTitle: z.string().max(300).optional().nullable(),
  seoDescription: z.string().max(500).optional().nullable(),
});
export type CreateProductInput = z.infer<typeof CreateProductInputSchema>;

/** brandId/categoryId are patchable; the same validations as create apply. */
export const UpdateProductInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  slug: z.string().min(1).max(160).optional(),
  brandId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  shortDescription: z.string().max(500).optional().nullable(),
  descriptionHtml: z.string().max(50_000).optional().nullable(),
  status: ProductStatusSchema.optional(),
  isBestseller: z.boolean().optional(),
  seoTitle: z.string().max(300).optional().nullable(),
  seoDescription: z.string().max(500).optional().nullable(),
});
export type UpdateProductInput = z.infer<typeof UpdateProductInputSchema>;

/** Article numbers: printable ASCII, 1-40 chars after whitespace collapsing. */
const ArticleNoSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(40)
      .regex(/^[\x20-\x7E]+$/, 'articleNo may only contain printable ASCII characters'),
  );

const EanSchema = z
  .union([
    z.literal(''),
    z
      .string()
      .trim()
      .refine((v) => /^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(v), 'ean must be a GTIN-8/12/13/14 (digits only)')
      .refine((v) => gtinChecksumOk(v), 'ean checksum is not valid (GTIN-8/12/13/14)'),
  ])
  .nullable()
  .optional()
  .transform((v) => (v === '' ? null : v));

/** Local GTIN wrapper so the schema error message stays specific. */
function gtinChecksumOk(value: string): boolean {
  const { isValidGtin } = gtinModule;
  return isValidGtin(value);
}
import * as gtinModule from '../../common/utils/gtin.util.js';

const leadTimeRefine = {
  message: 'leadTimeMinDays must be ≤ leadTimeMaxDays',
  path: ['leadTimeMinDays'],
};

const VariantFieldsSchema = z.object({
  listPrice: positivePriceString,
  currency: z.string().length(3).default('INR'),
  priceUnit: z.number().int().min(1).default(1),
  unitLabel: z.string().trim().min(1).max(40).default('Piece'),
  stockQty: z.number().int().min(0).default(0),
  leadTimeMinDays: z.number().int().min(0).nullable().optional(),
  leadTimeMaxDays: z.number().int().min(0).nullable().optional(),
  minOrderQty: z.number().int().min(1).default(1),
  packSize: z.number().int().min(1).default(1),
  isActive: z.boolean().default(true),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  sortOrder: z.number().int().default(0),
});

export const CreateVariantInputSchema = z
  .object({
    articleNo: ArticleNoSchema,
    ean: EanSchema,
    name: z.string().trim().max(200).nullable().optional(),
  })
  .merge(VariantFieldsSchema)
  .superRefine((val, ctx) => {
    if (
      val.leadTimeMinDays !== null &&
      val.leadTimeMinDays !== undefined &&
      val.leadTimeMaxDays !== null &&
      val.leadTimeMaxDays !== undefined &&
      val.leadTimeMinDays > val.leadTimeMaxDays
    ) {
      ctx.addIssue({ code: 'custom', ...leadTimeRefine });
    }
  });
export type CreateVariantInput = z.output<typeof CreateVariantInputSchema>;

/** Partial update; `attributes` (when present) REPLACES the variant's values. */
export const UpdateVariantInputSchema = z
  .object({
    articleNo: ArticleNoSchema.optional(),
    ean: EanSchema,
    name: z.string().trim().max(200).nullable().optional(),
  })
  .merge(VariantFieldsSchema.partial())
  .superRefine((val, ctx) => {
    if (
      val.leadTimeMinDays !== null &&
      val.leadTimeMinDays !== undefined &&
      val.leadTimeMaxDays !== null &&
      val.leadTimeMaxDays !== undefined &&
      val.leadTimeMinDays > val.leadTimeMaxDays
    ) {
      ctx.addIssue({ code: 'custom', ...leadTimeRefine });
    }
  });
export type UpdateVariantInput = z.output<typeof UpdateVariantInputSchema>;

/** Body of PUT /admin/products/:id/images — the bare replacement array. */
export const ReplaceImagesInputSchema = z
  .array(
    z.object({
      publicId: z.string().min(1).max(512),
      kind: ImageKindSchema.default('PHOTO'),
      alt: z.string().max(300).nullable().optional(),
      variantId: z.string().min(1).nullable().optional(),
      sortOrder: z.number().int().default(0),
    }),
  )
  .max(50);
export type ReplaceImagesInput = z.output<typeof ReplaceImagesInputSchema>;

/** Body of POST /admin/products/:id/documents — the bare replacement array. */
export const ReplaceDocumentsInputSchema = z
  .array(
    z.object({
      kind: DocKindSchema,
      title: z.string().trim().min(1).max(200),
      url: z.string().min(1).max(1000),
      publicId: z.string().min(1).max(512).nullable().optional(),
      sizeBytes: z.number().int().min(0).nullable().optional(),
    }),
  )
  .max(50);
export type ReplaceDocumentsInput = z.output<typeof ReplaceDocumentsInputSchema>;

/** Body of PUT /admin/products/:id/price-tiers/:variantId — replacement array. */
export const PriceTiersInputSchema = z
  .array(
    z.object({
      minQty: z.number().int().min(1),
      price: positivePriceString,
    }),
  )
  .max(50)
  .refine(
    (tiers) => tiers.every((t, i) => i === 0 || (tiers[i - 1] !== undefined && t.minQty > tiers[i - 1]!.minQty)),
    'tier quantities must be strictly increasing',
  );
export type PriceTiersInput = z.output<typeof PriceTiersInputSchema>;

/** GET /admin/products query (merged with pagination by the controller). */
export const AdminProductListQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  brandId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  status: ProductStatusSchema.optional(),
  stock: z.enum(['low']).optional(),
  sort: z.enum(['name', 'createdAt', 'updatedAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type AdminProductListQuery = z.output<typeof AdminProductListQuerySchema>;

// ── listing query (parsed by the controller, validated here) ────────────────

export interface ListingQuery {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  sort: Sort;
  inStock: boolean;
  brandSlugs: string[];
  /** Raw `<attrKey>=v1,v2` / `<attrKey>_min` / `<attrKey>_max` params. */
  attributeFilters: Record<string, string>;
}

/** Attribute the listing can filter on: definition + effective type info. */
interface FilterableAttribute {
  id: string;
  key: string;
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'ENUM';
  enumValues: string[] | null;
}

function filterIndexFromMappings(mappings: CategoryAttributeDto[]): Map<string, FilterableAttribute> {
  return new Map(
    mappings.map((m) => [m.key, { id: m.id, key: m.key, type: m.type, enumValues: m.enumValues }]),
  );
}

/** Attribute definitions → filter index (brand/search scope: every attribute mapped to ≥1 category). */
export function filterIndexFromDefs(defs: Array<{ id: string; key: string; type: string; enumValues: Prisma.JsonValue | null }>): Map<string, FilterableAttribute> {
  const entries = defs.map((d) => [
    d.key,
    {
      id: d.id,
      key: d.key,
      type: d.type as FilterableAttribute['type'],
      enumValues: Array.isArray(d.enumValues) ? d.enumValues.map((v) => String(v)) : null,
    },
  ] as const);
  return new Map(entries);
}

/**
 * Raw query params → attribute predicates. Unknown keys → 400 VALIDATION_ERROR
 * with details; type misuse (range on ENUM, bare value on NUMBER, non-boolean
 * on BOOLEAN, ENUM value outside its list) → 400. Shared by the category /
 * brand listings and the search endpoint (identical filter semantics).
 */
export function parseAttributeFilters(
  filters: Record<string, string>,
  index: Map<string, FilterableAttribute>,
): AttributePredicate[] {
  if (Object.keys(filters).length === 0) return [];

  const unknownKeys: string[] = [];
  const direct = new Map<string, string>();
  const ranges = new Map<string, { min?: string; max?: string }>();
  const issues: Array<{ param: string; message: string }> = [];

  for (const [rawParam, rawValue] of Object.entries(filters)) {
    const isMin = rawParam.endsWith('_min');
    const isMax = rawParam.endsWith('_max');
    if (!isMin && !isMax) {
      if (!index.has(rawParam)) unknownKeys.push(rawParam);
      else direct.set(rawParam, rawValue);
      continue;
    }
    const key = rawParam.slice(0, -4);
    const attr = index.get(key);
    if (!attr) {
      unknownKeys.push(rawParam);
      continue;
    }
    if (attr.type !== 'NUMBER') {
      issues.push({ param: rawParam, message: `range suffixes are only valid for NUMBER attributes — '${key}' is ${attr.type}` });
      continue;
    }
    const bucket = ranges.get(key) ?? {};
    if (isMin) bucket.min = rawValue;
    else bucket.max = rawValue;
    ranges.set(key, bucket);
  }
  if (unknownKeys.length > 0) {
    throw badRequest(`Unknown filter parameter(s): ${unknownKeys.join(', ')}`, { unknownKeys });
  }
  if (issues.length > 0) throw badRequest('Invalid filter parameter(s)', { issues });

  const predicates: AttributePredicate[] = [];
  for (const [key, raw] of direct) {
    const attr = index.get(key);
    if (!attr) continue;
    if (attr.type === 'NUMBER') {
      throw badRequest(`Attribute '${key}' is a NUMBER filter — use ${key}_min / ${key}_max instead`);
    }
    if (attr.type === 'BOOLEAN') {
      if (raw !== 'true' && raw !== 'false') {
        throw badRequest(`Attribute '${key}' is a BOOLEAN filter — value must be 'true' or 'false'`);
      }
      predicates.push({ attributeId: attr.id, valueBool: raw === 'true' });
      continue;
    }
    const values = raw.split(',').map((v) => v.trim()).filter((v) => v.length > 0);
    if (values.length === 0) throw badRequest(`Filter '${key}' received no values`);
    if (attr.type === 'ENUM') {
      const allowed = attr.enumValues ?? [];
      const invalid = values.filter((v) => !allowed.includes(v));
      if (invalid.length > 0) {
        throw badRequest(`Attribute '${key}' accepts: ${allowed.join(', ')}`, { key, invalidValues: invalid });
      }
    }
    predicates.push({ attributeId: attr.id, valueStringIn: values });
  }
  for (const [key, range] of ranges) {
    const attr = index.get(key);
    if (!attr) continue;
    const gte = range.min !== undefined ? Number(range.min) : undefined;
    const lte = range.max !== undefined ? Number(range.max) : undefined;
    if (range.min !== undefined && !Number.isFinite(gte)) throw badRequest(`${key}_min must be a number`);
    if (range.max !== undefined && !Number.isFinite(lte)) throw badRequest(`${key}_max must be a number`);
    predicates.push({ attributeId: attr.id, valueNumberGte: gte, valueNumberLte: lte });
  }
  return predicates;
}

export function orderByFor(sort: Sort): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'price_asc':
      return [{ minPrice: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
    case 'price_desc':
      return [{ minPrice: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }];
    case 'name':
      return [{ name: 'asc' }, { id: 'asc' }];
    case 'bestseller':
      return [{ isBestseller: 'desc' }, { minPrice: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
    case 'newest':
      return [{ createdAt: 'desc' }, { id: 'desc' }];
    case 'relevance':
    default:
      // Category/brand listings carry no text query — relevance degrades to
      // the stable newest-first order (text ranking is owned by the search
      // module, which keeps the repository's score order instead).
      return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
}

/** Scope of a listing: one category's active subtree, or one brand. */
interface ListingScope {
  category?: CategoryRow;
  brandSlug?: string;
}

// ── facets (spec 12: disjunctive counts over the current filtered set) ──────

/** A filterable attribute with the display metadata its facet carries. */
export interface FacetAttributeMeta {
  id: string;
  key: string;
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'ENUM';
  enumValues: string[] | null;
  label: string;
  labelHtml: string | null;
  groupName: string;
  unit: string | null;
  widget: 'CHECKBOX' | 'RANGE' | 'DROPDOWN';
}

/** Category's effective mapping → facet metadata (isFilterable entries only). */
function facetMetasFromMappings(mappings: CategoryAttributeDto[]): FacetAttributeMeta[] {
  return mappings
    .filter((m) => m.isFilterable)
    .map((m) => ({
      id: m.id,
      key: m.key,
      type: m.type,
      enumValues: m.enumValues,
      label: m.label,
      labelHtml: m.labelHtml,
      groupName: m.groupName,
      unit: m.unit,
      widget: m.filterWidget,
    }));
}

/** JsonValue → string[] (defensive against corrupt rows). */
function normalizeEnumList(value: Prisma.JsonValue | null): string[] | null {
  if (value === null || !Array.isArray(value)) return null;
  return value.map((v) => String(v));
}

/**
 * Global facet metadata for scopes without one category's effective mapping
 * (brand listings, full-text search): every attribute that is filterable in
 * ANY category mapping, deduped by attribute (lowest-sortOrder mapping wins).
 */
export async function listGlobalFacetAttributes(): Promise<FacetAttributeMeta[]> {
  const rows = await productsRepository.listFilterableMappings();
  const byId = new Map<string, FacetAttributeMeta>();
  for (const row of rows) {
    if (byId.has(row.attributeId)) continue;
    byId.set(row.attributeId, {
      id: row.attribute.id,
      key: row.attribute.key,
      type: row.attribute.type,
      enumValues: normalizeEnumList(row.attribute.enumValues),
      label: row.attribute.label,
      labelHtml: row.attribute.labelHtml,
      groupName: row.attribute.groupName,
      unit: row.attribute.unit,
      widget: row.filterWidget,
    });
  }
  return [...byId.values()];
}

/** Input of computeFacets — the disjunctive contract is documented there. */
export interface FacetScope {
  /**
   * Candidate product ids of the BASE scope only (published + not deleted +
   * category subtree / brand scope / search match). User filters (brand,
   * inStock, attribute predicates) must NOT be baked in — every facet
   * re-applies each filter EXCEPT its own.
   */
  scopeIds: string[];
  /** Filterable attributes the scope can facet on (metadata + count target). */
  facetAttributes: FacetAttributeMeta[];
  /** Parsed listing predicates (AND across attributes, OR inside value sets). */
  predicates: AttributePredicate[];
  /** User brand-slug filter (empty = none / scope-fixed brand). */
  brandSlugs: string[];
  /** User in-stock filter. */
  inStock: boolean;
}

function facetOf(
  attr: FacetAttributeMeta,
  values: FacetValueDto[],
  range: { min: number; max: number } | null,
): FacetDto {
  return {
    key: attr.key,
    label: attr.label,
    labelHtml: attr.labelHtml,
    groupName: attr.groupName,
    widget: attr.widget,
    unit: attr.unit,
    values,
    range,
  };
}

/** value/count pairs ordered by count desc, then value asc (stable). */
function sortedByCount(entries: Array<[value: string, count: number]>): FacetValueDto[] {
  return entries
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
}

/**
 * DISJUNCTIVE facet counts (spec 12), shared by the category/brand listings
 * and the search endpoint: for every filterable attribute, counts of DISTINCT
 * PRODUCTS in the current filtered result set EXCLUDING that attribute's own
 * predicate — selecting a value never zeroes its sibling counts. ENUM/STRING
 * group by valueString; BOOLEAN yields the two counts; NUMBER yields the
 * min/max range over the surviving products. The brand facet ignores the
 * brand filter, the inStock facet the inStock filter (same rule). Facets with
 * no data in scope are omitted.
 *
 * Query budget: 2 membership passes (brand, in-stock) + 1 attribute-value
 * pass over the scope, plus one per-variant predicate query per FILTERED
 * attribute (unfiltered listings pay no predicate queries).
 */
export async function computeFacets(scope: FacetScope): Promise<FacetDto[]> {
  const { scopeIds, facetAttributes, predicates, brandSlugs, inStock } = scope;
  if (scopeIds.length === 0) return [];

  // Shared membership passes (each facet set only ever shrinks these).
  const brandRows = await productsRepository.listBrandMembership(scopeIds);
  const brandOf = new Map(brandRows.map((r) => [r.id, r.brand]));
  const hasBrandFilter = brandSlugs.length > 0;
  const brandAllowed = new Set(brandSlugs);
  const afterBrand = hasBrandFilter
    ? scopeIds.filter((id) => {
        const brand = brandOf.get(id);
        return brand !== undefined && brandAllowed.has(brand.slug);
      })
    : scopeIds;
  const inStockIds = new Set(await productsRepository.listInStockProductIds(scopeIds));

  // Attribute facets: brand filter + inStock filter + the OTHER predicates.
  let attrBase = afterBrand;
  if (inStock) attrBase = attrBase.filter((id) => inStockIds.has(id));

  // Value rows over the base set, fetched once for every facet attribute.
  const rowsByAttr = new Map<string, FacetValueRow[]>();
  const valueRows = await productsRepository.listFacetValueRows(
    attrBase,
    facetAttributes.map((a) => a.id),
  );
  for (const row of valueRows) {
    const list = rowsByAttr.get(row.attributeId);
    if (list !== undefined) list.push(row);
    else rowsByAttr.set(row.attributeId, [row]);
  }

  const facets: FacetDto[] = [];

  for (const attr of facetAttributes) {
    // Disjunctive core: this attribute's own predicate is dropped.
    const others = predicates.filter((p) => p.attributeId !== attr.id);
    let ids = attrBase;
    if (others.length > 0) ids = await productsRepository.filterIdsByVariantAttributes(ids, others);
    if (ids.length === 0) continue;
    const idSet = new Set(ids);
    const rows = (rowsByAttr.get(attr.id) ?? []).filter((r) => idSet.has(r.variant.productId));

    if (attr.type === 'ENUM' || attr.type === 'STRING') {
      const productsByValue = new Map<string, Set<string>>();
      for (const row of rows) {
        if (row.valueString === null) continue;
        const set = productsByValue.get(row.valueString);
        if (set !== undefined) set.add(row.variant.productId);
        else productsByValue.set(row.valueString, new Set([row.variant.productId]));
      }
      const values = sortedByCount(
        [...productsByValue.entries()].map(([value, set]): [string, number] => [value, set.size]),
      );
      if (values.length > 0) facets.push(facetOf(attr, values, null));
      continue;
    }

    if (attr.type === 'BOOLEAN') {
      const trueProducts = new Set(rows.filter((r) => r.valueBool === true).map((r) => r.variant.productId));
      const falseProducts = new Set(rows.filter((r) => r.valueBool === false).map((r) => r.variant.productId));
      if (trueProducts.size === 0 && falseProducts.size === 0) continue;
      facets.push(
        facetOf(attr, [
          { value: 'true', count: trueProducts.size },
          { value: 'false', count: falseProducts.size },
        ], null),
      );
      continue;
    }

    // NUMBER: min/max range over the surviving products (own range dropped).
    const numbers = rows
      .map((r) => (r.valueNumber === null ? null : Number(r.valueNumber)))
      .filter((n): n is number => n !== null);
    if (numbers.length === 0) continue;
    facets.push(facetOf(attr, [], { min: Math.min(...numbers), max: Math.max(...numbers) }));
  }

  // Brand facet: inStock + ALL predicates applied, the brand filter dropped.
  let brandFacetIds = scopeIds;
  if (inStock) brandFacetIds = brandFacetIds.filter((id) => inStockIds.has(id));
  if (predicates.length > 0) {
    brandFacetIds = await productsRepository.filterIdsByVariantAttributes(brandFacetIds, predicates);
  }
  if (brandFacetIds.length > 0) {
    const countBySlug = new Map<string, number>();
    const nameBySlug = new Map<string, string>();
    for (const id of brandFacetIds) {
      const brand = brandOf.get(id);
      if (brand === undefined) continue; // defensive: every product has a brand
      countBySlug.set(brand.slug, (countBySlug.get(brand.slug) ?? 0) + 1);
      nameBySlug.set(brand.slug, brand.name);
    }
    const values = sortedByCount([...countBySlug.entries()]).sort(
      (a, b) => b.count - a.count || (nameBySlug.get(a.value) ?? '').localeCompare(nameBySlug.get(b.value) ?? ''),
    );
    if (values.length > 0) {
      facets.push({
        key: 'brand',
        label: 'Brand',
        labelHtml: null,
        groupName: 'General',
        widget: 'CHECKBOX',
        unit: null,
        values,
        range: null,
      });
    }
  }

  // In-stock facet: brand filter + ALL predicates applied, inStock dropped.
  let stockFacetIds = afterBrand;
  if (predicates.length > 0) {
    stockFacetIds = await productsRepository.filterIdsByVariantAttributes(stockFacetIds, predicates);
  }
  if (stockFacetIds.length > 0) {
    const inCount = stockFacetIds.filter((id) => inStockIds.has(id)).length;
    facets.push({
      key: 'inStock',
      label: 'In stock',
      labelHtml: null,
      groupName: 'General',
      widget: 'CHECKBOX',
      unit: null,
      values: [
        { value: 'true', count: inCount },
        { value: 'false', count: stockFacetIds.length - inCount },
      ],
      range: null,
    });
  }

  return facets;
}

async function listProducts(scope: ListingScope, query: ListingQuery): Promise<ListingResponse> {
  // Filter index (validation) + facet metadata for the scope.
  const mappings = scope.category !== undefined ? await attributesService.effectiveMappingsForCategory(scope.category) : null;
  const index =
    mappings !== null
      ? filterIndexFromMappings(mappings)
      : filterIndexFromDefs(await productsRepository.listMappedAttributeDefs());
  const predicates = parseAttributeFilters(query.attributeFilters, index);
  const facetAttributes = mappings !== null ? facetMetasFromMappings(mappings) : await listGlobalFacetAttributes();

  // Base scope ids: visibility + subtree/brand scope ONLY. The user brand
  // filter and inStock flag are replayed as id-list steps (same semantics as
  // the previous single-where version) so computeFacets can re-apply every
  // filter EXCEPT each facet's own — the disjunctive contract above.
  const where: Prisma.ProductWhereInput = { deletedAt: null, status: 'PUBLISHED' };
  if (scope.category !== undefined) {
    // Only ACTIVE subtree categories contribute (mirrors the count refresh,
    // which stops recursion at inactive/deleted nodes).
    const visibleIds = await productsRepository.listActiveSubtreeIds(scope.category);
    where.category = { id: { in: visibleIds } };
  }
  if (scope.brandSlug !== undefined) where.brand = { slug: scope.brandSlug };
  const scopeIds = await productsRepository.listIds(where);

  // Result set. On a brand-scoped listing the scope brand wins and the `brand`
  // query key stays ignored (documented behaviour).
  const userBrandSlugs = scope.brandSlug === undefined ? query.brandSlugs : [];
  let ids = scopeIds;
  if (userBrandSlugs.length > 0) {
    const membership = await productsRepository.listBrandMembership(ids);
    const brandByProduct = new Map(membership.map((m) => [m.id, m.brand.slug]));
    const allowed = new Set(userBrandSlugs);
    ids = ids.filter((id) => allowed.has(brandByProduct.get(id) ?? ''));
  }
  if (query.inStock) {
    const inStock = new Set(await productsRepository.listInStockProductIds(ids));
    ids = ids.filter((id) => inStock.has(id));
  }
  if (predicates.length > 0) ids = await productsRepository.filterIdsByVariantAttributes(ids, predicates);
  const total = ids.length;

  const [rows, facets] = await Promise.all([
    productsRepository.findPageByIds(ids, orderByFor(query.sort), query.skip, query.take),
    computeFacets({ scopeIds, facetAttributes, predicates, brandSlugs: userBrandSlugs, inStock: query.inStock }),
  ]);
  const items = await buildListingDtos(rows);

  const response: ListingResponse = { items, facets, total, sort: query.sort };
  if (scope.category !== undefined) response.categoryPath = await crumbsFor(scope.category);
  return response;
}

/** Attaches variants + first image to listing rows and maps them. */
export async function buildListingDtos(rows: ProductListRow[]): Promise<ListingProductDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [variants, images] = await Promise.all([
    productsRepository.listActiveVariantsLite(ids),
    productsRepository.listImagesLite(ids),
  ]);
  const variantsByProduct = new Map<string, VariantDetailRowLite[]>();
  for (const v of variants) {
    const list = variantsByProduct.get(v.productId);
    if (list !== undefined) list.push(v);
    else variantsByProduct.set(v.productId, [v]);
  }
  const imageByProduct = new Map<string, (typeof images)[number]>();
  for (const image of images) {
    if (!imageByProduct.has(image.productId)) imageByProduct.set(image.productId, image);
  }
  return rows.map((r) =>
    toListingDto(r, variantsByProduct.get(r.id) ?? [], imageByProduct.get(r.id) ?? null),
  );
}
type VariantDetailRowLite = (Awaited<ReturnType<typeof productsRepository.listActiveVariantsLite>>)[number];

async function crumbsFor(category: CategoryRow): Promise<CrumbDto[]> {
  const pathIds = category.path.split('/').filter((s) => s.length > 0);
  const rows = await catalogRepository.findManyByIds(pathIds);
  return toCrumbs(pathIds, rows);
}

// ── public reads ────────────────────────────────────────────────────────────

/**
 * PDP by slug — PUBLISHED, non-deleted products only (draft/archived/deleted
 * → 404). Not cached yet: stock/price must stay fresh; Phase 5 adds caching
 * with tag invalidation.
 */
async function detailBySlug(slug: string): Promise<ProductDetailDto> {
  const product = await productsRepository.findPublishedBySlug(slug);
  if (!product) throw notFound('Product not found');
  const [mappings, ancestors] = await Promise.all([
    attributesService.effectiveMappingsForCategory(product.category),
    catalogRepository.findManyByIds(product.category.path.split('/').filter((s) => s.length > 0)),
  ]);
  return toDetailDto(product, mappings, ancestors);
}

/** Variant by exact articleNo — public visibility rules apply, else 404. */
async function variantByArticleNo(articleNo: string): Promise<VariantDto> {
  const variant = await productsRepository.findVariantByArticleNo(articleNo);
  if (!variant || variant.deletedAt !== null || !variant.isActive) throw notFound('Variant not found');
  if (variant.product.deletedAt !== null || variant.product.status !== 'PUBLISHED') {
    throw notFound('Variant not found');
  }
  return toVariantDto(variant);
}

/** Same category, same brand preferred, PUBLISHED, self excluded. */
async function relatedProducts(slug: string): Promise<ListingProductDto[]> {
  const product = await productsRepository.findPublishedRefBySlug(slug);
  if (!product) throw notFound('Product not found');
  const rows = await productsRepository.listRelatedCandidates(
    product.categoryId,
    product.brandId,
    product.id,
    RELATED_LIMIT,
  );
  return buildListingDtos(rows);
}

/** GET /categories/:code/products — the subtree listing with facet counts. */
async function listByCategory(code: string, query: ListingQuery): Promise<ListingResponse> {
  const category = await catalogRepository.findActiveByCode(code);
  if (!category) throw notFound('Category not found');
  return listProducts({ category }, query);
}

/** GET /brands/:slug/products — the same listing scoped to one brand. */
async function listByBrand(brandSlug: string, query: ListingQuery): Promise<ListingResponse> {
  const brand = await brandsRepository.findBySlug(brandSlug);
  if (!brand) throw notFound('Brand not found');
  return listProducts({ brandSlug }, query);
}

// ── admin: shared validation helpers ────────────────────────────────────────

/** Optional text fields may arrive as "" — store NULL instead. */
function blankToNull(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === '' ? null : value;
}

async function mustFindProduct(id: string, tx?: Transaction) {
  // With names: the admin PATCH response maps the row even when nothing changed.
  const row = await productsRepository.findByIdWithNames(id, tx);
  if (!row || row.deletedAt !== null) throw notFound('Product not found');
  return row;
}

/** Category must exist, be active and (per policy) be a leaf. */
async function resolveProductCategory(categoryId: string, tx?: Transaction): Promise<CategoryRow> {
  const category = await catalogRepository.findById(categoryId, tx);
  if (!category || category.deletedAt !== null) throw notFound('Category not found');
  if (!category.isActive) throw badRequest('Category is not active');
  if (!ALLOW_NONLEAF_PRODUCTS) {
    const liveChildren = await catalogRepository.countLiveChildren(category.id, tx);
    if (liveChildren > 0) {
      throw badRequest('Products can only be created in leaf categories (this category has child categories)', {
        childCount: liveChildren,
      });
    }
  }
  return category;
}

/** Slug + "-2", "-3"… until free (product slugs are globally unique). */
async function uniqueProductSlug(base: string, excludeId: string | null, tx: Transaction): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (await productsRepository.slugTaken(candidate, excludeId, tx)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
    if (suffix > 50) throw conflict(`Could not derive a unique slug for '${base}'`);
  }
  return candidate;
}

/** Admin single-product shape (create/update responses). */
function toAdminProductDto(row: AdminProductRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    isBestseller: row.isBestseller,
    brandId: row.brandId,
    brandName: row.brand.name,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    shortDescription: row.shortDescription,
    descriptionHtml: row.descriptionHtml,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    minPrice: row.minPrice === null ? null : row.minPrice.toFixed(2),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
export type AdminProductDto = ReturnType<typeof toAdminProductDto>;

/** Admin table row shape. */
function toAdminProductListDto(row: AdminProductListRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    brandName: row.brand.name,
    categoryName: row.category.name,
    variantCount: row._count.variants,
    minPrice: row.minPrice === null ? null : row.minPrice.toFixed(2),
    imageCount: row._count.images,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
export type AdminProductListItemDto = ReturnType<typeof toAdminProductListDto>;

/** Variant attributes validated against the category's effective mapping. */
interface ValidatedAttributes {
  rows: Array<{ attributeId: string; valueString?: string; valueNumber?: number; valueBool?: boolean }>;
  valuesByKey: Map<string, string | number | boolean>;
}

function validateAttributesAgainstMapping(
  mappings: CategoryAttributeDto[],
  attributes: VariantAttributes,
): ValidatedAttributes {
  const byKey = new Map(mappings.map((m) => [m.key, m]));
  const unknownKeys = Object.keys(attributes).filter((k) => !byKey.has(k));
  if (unknownKeys.length > 0) {
    throw badRequest(`Unknown attribute key(s) for this category's mapping: ${unknownKeys.join(', ')}`, {
      unknownKeys,
      validKeys: [...byKey.keys()],
    });
  }
  const rows: ValidatedAttributes['rows'] = [];
  const valuesByKey = new Map<string, string | number | boolean>();
  for (const [key, value] of Object.entries(attributes)) {
    const mapping = byKey.get(key);
    if (!mapping) continue; // guarded above
    if (value === null) continue; // null clears the value
    switch (mapping.type) {
      case 'STRING': {
        if (typeof value !== 'string') throw badRequest(`Attribute '${key}' expects a string value`);
        rows.push({ attributeId: mapping.id, valueString: value });
        valuesByKey.set(key, value);
        break;
      }
      case 'ENUM': {
        if (typeof value !== 'string') {
          throw badRequest(`Attribute '${key}' expects one of: ${(mapping.enumValues ?? []).join(', ')}`);
        }
        const allowed = mapping.enumValues ?? [];
        if (!allowed.includes(value)) {
          throw badRequest(`Attribute '${key}' expects one of: ${allowed.join(', ')}`, { key, value });
        }
        rows.push({ attributeId: mapping.id, valueString: value });
        valuesByKey.set(key, value);
        break;
      }
      case 'NUMBER': {
        const num =
          typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
        if (!Number.isFinite(num)) throw badRequest(`Attribute '${key}' expects a numeric value`);
        rows.push({ attributeId: mapping.id, valueNumber: num });
        valuesByKey.set(key, num);
        break;
      }
      case 'BOOLEAN': {
        if (typeof value !== 'boolean') throw badRequest(`Attribute '${key}' expects a boolean value`);
        rows.push({ attributeId: mapping.id, valueBool: value });
        valuesByKey.set(key, value);
        break;
      }
    }
  }
  return { rows, valuesByKey };
}

/** isRequired OR variant-axis attributes must be present on every variant. */
function assertRequiredAttributesPresent(
  mappings: CategoryAttributeDto[],
  valuesByKey: Map<string, string | number | boolean>,
): void {
  const missing = mappings
    .filter((m) => (m.isRequired || m.isVariantAxis) && !valuesByKey.has(m.key))
    .map((m) => m.key);
  if (missing.length > 0) {
    throw badRequest(`Missing required attribute(s): ${missing.join(', ')}`, { missing });
  }
}

function axisKeysOf(mappings: CategoryAttributeDto[]): string[] {
  return mappings
    .filter((m) => m.isVariantAxis)
    .map((m) => m.key)
    .sort();
}

/** Signature of the NEW variant's axis values; null when the category has no axes. */
function axisSignature(mappings: CategoryAttributeDto[], valuesByKey: Map<string, string | number | boolean>): string | null {
  const keys = axisKeysOf(mappings);
  if (keys.length === 0) return null;
  return keys.map((key) => {
    const value = valuesByKey.get(key);
    return value === undefined ? '' : String(value);
  }).join('|');
}

/** Signature of an EXISTING variant's axis values (same normalization). */
function existingAxisSignature(variant: VariantDetailRow, axisKeys: string[]): string {
  return axisKeys
    .map((key) => {
      const row = variant.attributes.find((a) => a.attribute.key === key);
      if (!row) return '';
      if (row.valueString !== null) return row.valueString;
      if (row.valueNumber !== null) return row.valueNumber.toString();
      if (row.valueBool !== null) return String(row.valueBool);
      return '';
    })
    .join('|');
}

function axisDetails(variant: VariantDetailRow, axisKeys: string[]): Record<string, string> {
  const details: Record<string, string> = {};
  for (const key of axisKeys) {
    const row = variant.attributes.find((a) => a.attribute.key === key);
    details[key] =
      row?.valueString ??
      (row?.valueNumber !== null && row?.valueNumber !== undefined ? row.valueNumber.toString() : row?.valueBool !== null && row?.valueBool !== undefined ? String(row.valueBool) : '');
  }
  return details;
}

/** Category of an existing product (must exist; delete is blocked while products live). */
async function categoryForProduct(categoryId: string, tx?: Transaction): Promise<CategoryRow> {
  const category = await catalogRepository.findById(categoryId, tx);
  if (!category || category.deletedAt !== null) throw notFound('Category not found');
  return category;
}

async function mustFindVariantOfProduct(productId: string, variantId: string, tx?: Transaction): Promise<VariantDetailRow> {
  const variant = await productsRepository.findVariantById(variantId, tx);
  if (!variant || variant.productId !== productId || variant.deletedAt !== null) {
    throw notFound('Variant not found');
  }
  return variant;
}

// ── admin: product CRUD ─────────────────────────────────────────────────────

/** POST /admin/products — slug auto from name, leaf+brand validated, audited. */
async function createProduct(
  actorId: string,
  input: CreateProductInput,
  ip: string | null,
): Promise<AdminProductDto> {
  const row = await withTransaction(async (tx) => {
    await resolveProductCategory(input.categoryId, tx);
    const brand = await brandsRepository.findById(input.brandId, tx);
    if (!brand) throw notFound('Brand not found');
    const slug = await uniqueProductSlug(slugify(input.slug?.trim() || input.name) || 'product', null, tx);
    const created = await productsRepository.createProduct(
      {
        name: input.name,
        slug,
        brandId: input.brandId,
        categoryId: input.categoryId,
        shortDescription: blankToNull(input.shortDescription),
        descriptionHtml:
          input.descriptionHtml !== undefined && input.descriptionHtml !== null
            ? sanitizeDescriptionHtml(input.descriptionHtml)
            : null,
        status: input.status,
        isBestseller: input.isBestseller,
        seoTitle: blankToNull(input.seoTitle),
        seoDescription: blankToNull(input.seoDescription),
        minPrice: null,
      },
      tx,
    );
    await writeAudit(
      actorId,
      'product.create',
      'product',
      created.id,
      { name: input.name, slug, status: input.status, brandId: input.brandId, categoryId: input.categoryId },
      ip,
      tx,
    );
    return created;
  });
  afterProductWrite(row);
  return toAdminProductDto(row);
}

/** PATCH /admin/products/:id — partial; slug changes record PRODUCT redirects. */
async function updateProduct(
  actorId: string,
  id: string,
  input: UpdateProductInput,
  ip: string | null,
): Promise<AdminProductDto> {
  const row = await withTransaction(async (tx) => {
    const current = await mustFindProduct(id, tx);
    const data: Prisma.ProductUncheckedUpdateInput = {};
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    const track = (field: string, from: unknown, to: unknown): void => {
      (data as Record<string, unknown>)[field] = to;
      diff[field] = { from, to };
    };

    if (input.categoryId !== undefined && input.categoryId !== current.categoryId) {
      await resolveProductCategory(input.categoryId, tx);
      track('categoryId', current.categoryId, input.categoryId);
    }
    if (input.brandId !== undefined && input.brandId !== current.brandId) {
      const brand = await brandsRepository.findById(input.brandId, tx);
      if (!brand) throw notFound('Brand not found');
      track('brandId', current.brandId, input.brandId);
    }
    if (input.name !== undefined && input.name !== current.name) track('name', current.name, input.name);
    if (input.shortDescription !== undefined) {
      const v = blankToNull(input.shortDescription);
      if (v !== current.shortDescription) track('shortDescription', current.shortDescription, v);
    }
    if (input.descriptionHtml !== undefined) {
      const v = input.descriptionHtml === null || input.descriptionHtml === '' ? null : sanitizeDescriptionHtml(input.descriptionHtml);
      if (v !== current.descriptionHtml) track('descriptionHtml', current.descriptionHtml, v);
    }
    if (input.seoTitle !== undefined) {
      const v = blankToNull(input.seoTitle);
      if (v !== current.seoTitle) track('seoTitle', current.seoTitle, v);
    }
    if (input.seoDescription !== undefined) {
      const v = blankToNull(input.seoDescription);
      if (v !== current.seoDescription) track('seoDescription', current.seoDescription, v);
    }
    if (input.status !== undefined && input.status !== current.status) {
      track('status', current.status, input.status);
    }
    if (input.isBestseller !== undefined && input.isBestseller !== current.isBestseller) {
      track('isBestseller', current.isBestseller, input.isBestseller);
    }

    if (input.slug !== undefined && input.slug !== current.slug) {
      const slug = await uniqueProductSlug(slugify(input.slug) || 'product', id, tx);
      if (slug !== current.slug) {
        track('slug', current.slug, slug);
        // Bare product slug → new slug (product URLs are /product/{slug}).
        await productsRepository.upsertSlugRedirect(current.slug, slug, tx);
      }
    }

    const updated = Object.keys(data).length > 0 ? await productsRepository.updateProductById(id, data, tx) : current;
    await writeAudit(actorId, 'product.update', 'product', id, diff, ip, tx);
    return updated;
  });
  afterProductWrite(row);
  return toAdminProductDto(row);
}

/** DELETE /admin/products/:id — soft delete incl. variants; 409 when already deleted. */
async function deleteProduct(actorId: string, id: string, ip: string | null): Promise<void> {
  const row = await withTransaction(async (tx) => {
    const current = await productsRepository.findById(id, tx);
    if (!current) throw notFound('Product not found');
    if (current.deletedAt !== null) throw conflict('Product is already deleted');
    await productsRepository.softDeleteProduct(id, tx);
    await writeAudit(actorId, 'product.delete', 'product', id, { slug: current.slug }, ip, tx);
    return current;
  });
  afterProductWrite(row);
}

// ── admin: bulk + duplicate (spec 15.2) ─────────────────────────────────────

const BulkActionSchema = z.enum(['PUBLISH', 'UNPUBLISH', 'ARCHIVE', 'RESTORE', 'DELETE', 'MOVE']);
export const BulkUpdateInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: BulkActionSchema,
  categoryId: z.string().min(1).optional(),
});
export type BulkUpdateInput = z.output<typeof BulkUpdateInputSchema>;

/**
 * POST /admin/products/bulk — applies one action to many products in a single
 * transaction. MOVE additionally re-validates that the target category exists
 * and is active. Returns the number of products actually changed (404s never
 * abort the batch — the UI shows affected ids). Every action is audited.
 */
async function bulkUpdate(actorId: string, input: BulkUpdateInput, ip: string | null): Promise<{ updated: number }> {
  if (input.action === 'MOVE') {
    if (input.categoryId === undefined) throw badRequest('categoryId is required for MOVE');
    await resolveProductCategory(input.categoryId); // 404 when missing/inactive
  } else if (input.categoryId !== undefined) {
    throw badRequest('categoryId is only allowed for MOVE');
  }

  const updated = await withTransaction(async (tx) => {
    let count = 0;
    for (const id of input.ids) {
      const current = await productsRepository.findById(id, tx);
      if (current === null) continue;
      // Every action except RESTORE targets live products; RESTORE is the only
      // way back from a soft delete, so it must match the deleted ones.
      if (current.deletedAt !== null && input.action !== 'RESTORE') continue;

      switch (input.action) {
        case 'PUBLISH':
        case 'UNPUBLISH':
        case 'ARCHIVE': {
          const status =
            input.action === 'PUBLISH' ? 'PUBLISHED' : input.action === 'UNPUBLISH' ? 'DRAFT' : 'ARCHIVED';
          if (current.status === status) break;
          await productsRepository.updateProductById(id, { status }, tx);
          await writeAudit(actorId, 'product.bulk_status', 'product', id, { from: current.status, to: status }, ip, tx);
          count += 1;
          break;
        }
        case 'RESTORE': {
          if (current.deletedAt === null) break;
          await tx.variant.updateMany({ where: { productId: id }, data: { deletedAt: null } });
          await productsRepository.updateProductById(id, { deletedAt: null }, tx);
          await recomputeProductMinPrice(id, tx);
          await writeAudit(actorId, 'product.restore', 'product', id, { slug: current.slug }, ip, tx);
          count += 1;
          break;
        }
        case 'DELETE': {
          await productsRepository.softDeleteProduct(id, tx);
          await writeAudit(actorId, 'product.delete', 'product', id, { slug: current.slug, bulk: true }, ip, tx);
          count += 1;
          break;
        }
        case 'MOVE': {
          const categoryId = input.categoryId as string;
          if (current.categoryId === categoryId) break;
          await productsRepository.updateProductById(id, { categoryId }, tx);
          await writeAudit(actorId, 'product.bulk_move', 'product', id, { from: current.categoryId, to: categoryId }, ip, tx);
          count += 1;
          break;
        }
      }
    }
    return count;
  });

  if (updated > 0) {
    scheduleRevalidate([TAGS.home, TAGS.navigation]);
  }
  return { updated };
}

/**
 * POST /admin/products/:id/duplicate — deep-copies a product with variants
 * (incl. attribute values + price tiers), images and documents. The copy is a
 * DRAFT with name "<name> (copy)", a free slug, suffixed article numbers and
 * EANs cleared (they are unique globally). Returns the new product's admin DTO.
 */
async function duplicateProduct(actorId: string, id: string, ip: string | null): Promise<AdminProductDto> {
  const source = await productsRepository.findById(id);
  if (source === null) throw notFound('Product not found');

  const copy = await withTransaction(async (tx) => {
    const baseSlug = slugify(`${source.name} copy`) || 'product-copy';
    const slug = await uniqueProductSlug(baseSlug, source.id, tx);
    const name = `${source.name} (copy)`;

    const product = await tx.product.create({
      data: {
        slug,
        name,
        brandId: source.brandId,
        categoryId: source.categoryId,
        shortDescription: source.shortDescription,
        descriptionHtml: source.descriptionHtml,
        isBestseller: false,
        status: 'DRAFT',
        seoTitle: source.seoTitle,
        seoDescription: source.seoDescription,
      },
    });

    // Variants + attribute values + price tiers (EAN dropped: globally unique).
    const variants = await tx.variant.findMany({
      where: { productId: source.id, deletedAt: null },
      include: { attributes: true, priceTiers: true },
      orderBy: { sortOrder: 'asc' },
    });
    for (const variant of variants) {
      let articleNo = `${variant.articleNo}-C`;
      let suffix = 2;
      while (await productsRepository.articleNoTaken(articleNo, null, tx)) {
        articleNo = `${variant.articleNo}-C${suffix}`;
        suffix += 1;
      }
      const created = await tx.variant.create({
        data: {
          productId: product.id,
          articleNo,
          ean: null,
          name: variant.name,
          listPrice: variant.listPrice,
          currency: variant.currency,
          priceUnit: variant.priceUnit,
          unitLabel: variant.unitLabel,
          taxClass: variant.taxClass,
          stockQty: variant.stockQty,
          leadTimeMinDays: variant.leadTimeMinDays,
          leadTimeMaxDays: variant.leadTimeMaxDays,
          minOrderQty: variant.minOrderQty,
          packSize: variant.packSize,
          isActive: variant.isActive,
          sortOrder: variant.sortOrder,
        },
      });
      if (variant.attributes.length > 0) {
        await tx.productAttributeValue.createMany({
          data: variant.attributes.map((attribute) => ({
            variantId: created.id,
            attributeId: attribute.attributeId,
            valueString: attribute.valueString,
            valueNumber: attribute.valueNumber,
            valueBool: attribute.valueBool,
          })),
        });
      }
      if (variant.priceTiers.length > 0) {
        await tx.priceTier.createMany({
          data: variant.priceTiers.map((tier) => ({ variantId: created.id, minQty: tier.minQty, price: tier.price })),
        });
      }
    }

    // Images and documents point at the same Cloudinary assets (publicId is
    // not unique) — cheap sharing, no re-upload.
    const images = await tx.productImage.findMany({ where: { productId: source.id } });
    if (images.length > 0) {
      await tx.productImage.createMany({
        data: images.map((image) => ({
          productId: product.id,
          publicId: image.publicId,
          kind: image.kind,
          alt: image.alt,
          sortOrder: image.sortOrder,
        })),
      });
    }
    const documents = await tx.productDocument.findMany({ where: { productId: source.id } });
    if (documents.length > 0) {
      await tx.productDocument.createMany({
        data: documents.map((document) => ({
          productId: product.id,
          kind: document.kind,
          title: document.title,
          url: document.url,
          publicId: document.publicId,
          sizeBytes: document.sizeBytes,
        })),
      });
    }

    await recomputeProductMinPrice(product.id, tx);
    await writeAudit(actorId, 'product.duplicate', 'product', product.id, { sourceId: source.id, slug }, ip, tx);
    return tx.product.findUnique({
      where: { id: product.id },
      include: { brand: { select: { name: true } }, category: { select: { name: true } } },
    });
  });
  if (copy !== null) {
    afterProductWrite(copy);
  }
  return toAdminProductDto(copy as AdminProductRow);
}

// ── admin: variants ─────────────────────────────────────────────────────────

/**
 * POST /admin/products/:id/variants — creates the variant + attribute values
 * and recomputes product.minPrice in one transaction. Validates articleNo/
 * EAN uniqueness, the category's effective mapping and variant-axis
 * combination uniqueness (409 with the conflicting variant's details).
 */
async function createVariant(
  actorId: string,
  productId: string,
  input: CreateVariantInput,
  ip: string | null,
): Promise<VariantDto> {
  const variant = await withTransaction(async (tx) => {
    await mustFindProduct(productId, tx);
    const category = await categoryForProduct((await mustFindProduct(productId, tx)).categoryId, tx);
    const mappings = await attributesService.effectiveMappingsForCategory(category);
    const validated = validateAttributesAgainstMapping(mappings, input.attributes);
    assertRequiredAttributesPresent(mappings, validated.valuesByKey);

    const keys = axisKeysOf(mappings);
    const signature = axisSignature(mappings, validated.valuesByKey);
    if (signature !== null) {
      const siblings = await productsRepository.listVariantsWithAttributes(productId, tx);
      for (const sibling of siblings) {
        if (existingAxisSignature(sibling, keys) === signature) {
          throw conflict('A variant with the same variant-axis combination already exists for this product', {
            conflictingVariantId: sibling.id,
            conflictingArticleNo: sibling.articleNo,
            axis: axisDetails(sibling, keys),
          });
        }
      }
    }

    if (await productsRepository.articleNoTaken(input.articleNo, null, tx)) {
      throw conflict(`articleNo '${input.articleNo}' is already in use`);
    }
    if (input.ean !== null && input.ean !== undefined && (await productsRepository.eanTaken(input.ean, null, tx))) {
      throw conflict(`ean '${input.ean}' is already in use`);
    }

    const created = await productsRepository.createVariant(
      {
        productId,
        articleNo: input.articleNo,
        ean: input.ean ?? null,
        name: input.name ?? null,
        listPrice: new Prisma.Decimal(input.listPrice),
        currency: input.currency,
        priceUnit: input.priceUnit,
        unitLabel: input.unitLabel,
        stockQty: input.stockQty,
        leadTimeMinDays: input.leadTimeMinDays ?? null,
        leadTimeMaxDays: input.leadTimeMaxDays ?? null,
        minOrderQty: input.minOrderQty,
        packSize: input.packSize,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
        attributes: { create: validated.rows },
      },
      tx,
    );
    await recomputeProductMinPrice(productId, tx);
    await writeAudit(
      actorId,
      'product.variant.create',
      'variant',
      created.id,
      { productId, articleNo: created.articleNo, axis: axisDetails(created, keys) },
      ip,
      tx,
    );
    return created;
  });
  afterProductWrite(await mustFindProduct(productId));
  return toVariantDto(variant);
}

/**
 * PATCH /admin/products/:id/variants/:variantId — partial update; `attributes`
 * merge-replaces the stored values (final set must satisfy the mapping).
 * minPrice is recomputed on every write.
 */
async function updateVariant(
  actorId: string,
  productId: string,
  variantId: string,
  input: UpdateVariantInput,
  ip: string | null,
): Promise<VariantDto> {
  const variant = await withTransaction(async (tx) => {
    const product = await mustFindProduct(productId, tx);
    const current = await mustFindVariantOfProduct(productId, variantId, tx);
    const category = await categoryForProduct(product.categoryId, tx);
    const mappings = await attributesService.effectiveMappingsForCategory(category);

    // Final attribute set: existing values overridden by the patch payload.
    const merged: VariantAttributes =
      input.attributes !== undefined ? { ...attributesMap(current.attributes), ...input.attributes } : attributesMap(current.attributes);
    const validated = validateAttributesAgainstMapping(mappings, merged);
    assertRequiredAttributesPresent(mappings, validated.valuesByKey);

    const keys = axisKeysOf(mappings);
    const signature = axisSignature(mappings, validated.valuesByKey);
    if (signature !== null) {
      const siblings = await productsRepository.listVariantsWithAttributes(productId, tx);
      for (const sibling of siblings) {
        if (sibling.id === variantId) continue;
        if (existingAxisSignature(sibling, keys) === signature) {
          throw conflict('A variant with the same variant-axis combination already exists for this product', {
            conflictingVariantId: sibling.id,
            conflictingArticleNo: sibling.articleNo,
            axis: axisDetails(sibling, keys),
          });
        }
      }
    }

    const data: Prisma.VariantUncheckedUpdateInput = {};
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    const track = (field: string, from: unknown, to: unknown): void => {
      (data as Record<string, unknown>)[field] = to;
      diff[field] = { from, to };
    };

    if (input.articleNo !== undefined && input.articleNo !== current.articleNo) {
      if (await productsRepository.articleNoTaken(input.articleNo, variantId, tx)) {
        throw conflict(`articleNo '${input.articleNo}' is already in use`);
      }
      track('articleNo', current.articleNo, input.articleNo);
    }
    if (input.ean !== undefined) {
      const ean = input.ean === '' ? null : input.ean;
      if (ean !== current.ean) {
        if (ean !== null && (await productsRepository.eanTaken(ean, variantId, tx))) {
          throw conflict(`ean '${ean}' is already in use`);
        }
        track('ean', current.ean, ean);
      }
    }
    if (input.name !== undefined) {
      const v = input.name === '' ? null : input.name;
      if (v !== current.name) track('name', current.name, v);
    }
    if (input.listPrice !== undefined && new Prisma.Decimal(input.listPrice).equals(current.listPrice) === false) {
      track('listPrice', current.listPrice.toFixed(2), new Prisma.Decimal(input.listPrice));
    }
    if (input.currency !== undefined && input.currency !== current.currency) track('currency', current.currency, input.currency);
    if (input.priceUnit !== undefined && input.priceUnit !== current.priceUnit) track('priceUnit', current.priceUnit, input.priceUnit);
    if (input.unitLabel !== undefined && input.unitLabel !== current.unitLabel) track('unitLabel', current.unitLabel, input.unitLabel);
    if (input.stockQty !== undefined && input.stockQty !== current.stockQty) track('stockQty', current.stockQty, input.stockQty);
    if (input.minOrderQty !== undefined && input.minOrderQty !== current.minOrderQty) track('minOrderQty', current.minOrderQty, input.minOrderQty);
    if (input.packSize !== undefined && input.packSize !== current.packSize) track('packSize', current.packSize, input.packSize);
    if (input.isActive !== undefined && input.isActive !== current.isActive) track('isActive', current.isActive, input.isActive);
    if (input.sortOrder !== undefined && input.sortOrder !== current.sortOrder) track('sortOrder', current.sortOrder, input.sortOrder);

    const nextLeadMin = input.leadTimeMinDays !== undefined ? input.leadTimeMinDays : current.leadTimeMinDays;
    const nextLeadMax = input.leadTimeMaxDays !== undefined ? input.leadTimeMaxDays : current.leadTimeMaxDays;
    if (nextLeadMin !== current.leadTimeMinDays) track('leadTimeMinDays', current.leadTimeMinDays, nextLeadMin);
    if (nextLeadMax !== current.leadTimeMaxDays) track('leadTimeMaxDays', current.leadTimeMaxDays, nextLeadMax);
    if (
      nextLeadMin !== null &&
      nextLeadMin !== undefined &&
      nextLeadMax !== null &&
      nextLeadMax !== undefined &&
      nextLeadMin > nextLeadMax
    ) {
      throw badRequest('leadTimeMinDays must be ≤ leadTimeMaxDays');
    }

    const updated =
      Object.keys(data).length > 0 ? await productsRepository.updateVariantById(variantId, data, tx) : current;
    if (input.attributes !== undefined) {
      await productsRepository.replaceVariantAttributes(variantId, validated.rows, tx);
    }
    await recomputeProductMinPrice(productId, tx);
    await writeAudit(actorId, 'product.variant.update', 'variant', variantId, diff, ip, tx);
    return updated;
  });
  afterProductWrite(await mustFindProduct(productId));
  return toVariantDto(variant);
}

/** DELETE /admin/products/:id/variants/:variantId — soft delete; last active variant → 409. */
async function deleteVariant(actorId: string, productId: string, variantId: string, ip: string | null): Promise<void> {
  await withTransaction(async (tx) => {
    await mustFindProduct(productId, tx);
    const variant = await mustFindVariantOfProduct(productId, variantId, tx);
    if (variant.isActive) {
      const siblings = await productsRepository.listVariantsWithAttributes(productId, tx);
      const otherActive = siblings.some((s) => s.id !== variantId && s.isActive && s.deletedAt === null);
      if (!otherActive) {
        throw conflict('Cannot delete the last active variant of a product', { variantId });
      }
    }
    await productsRepository.softDeleteVariant(variantId, tx);
    await recomputeProductMinPrice(productId, tx);
    await writeAudit(actorId, 'product.variant.delete', 'variant', variantId, { articleNo: variant.articleNo }, ip, tx);
  });
  afterProductWrite(await mustFindProduct(productId));
}

// ── admin: images / documents / price tiers ────────────────────────────────

/** PUT /admin/products/:id/images — REPLACES the image list. */
async function replaceImages(
  actorId: string,
  productId: string,
  items: ReplaceImagesInput,
  ip: string | null,
): Promise<ImageDto[]> {
  await withTransaction(async (tx) => {
    await mustFindProduct(productId, tx);
    const invalid = items.filter((i) => !isValidPublicId(i.publicId));
    if (invalid.length > 0) {
      throw badRequest('Invalid image publicId(s)', { publicIds: invalid.map((i) => i.publicId) });
    }
    const withVariant = items.filter((i) => i.variantId !== undefined && i.variantId !== null);
    if (withVariant.length > 0) {
      const ownVariantIds = new Set(await productsRepository.listVariantIds(productId, tx));
      const bad = withVariant.filter((i) => i.variantId !== null && i.variantId !== undefined && !ownVariantIds.has(i.variantId));
      if (bad.length > 0) {
        throw badRequest('Image references a variant that does not belong to this product', {
          variantIds: bad.map((i) => i.variantId),
        });
      }
    }
    await productsRepository.replaceImages(
      productId,
      items.map((i) => ({
        publicId: i.publicId,
        kind: i.kind,
        alt: blankToNull(i.alt),
        variantId: i.variantId ?? null,
        sortOrder: i.sortOrder,
      })),
      tx,
    );
    await writeAudit(actorId, 'product.images.replace', 'product', productId, { count: items.length }, ip, tx);
  });
  afterProductWrite(await mustFindProduct(productId));
  const images = await productsRepository.listImagesByProduct(productId);
  return toImageDtos(images);
}

/**
 * POST /admin/products/:id/documents — REPLACES the document list (same
 * semantics as the images PUT; publicId-resolved documents win over raw URLs).
 */
async function replaceDocuments(
  actorId: string,
  productId: string,
  items: ReplaceDocumentsInput,
  ip: string | null,
): Promise<Array<{ id: string; kind: string; title: string; url: string; sizeBytes: number | null }>> {
  await withTransaction(async (tx) => {
    await mustFindProduct(productId, tx);
    for (const item of items) {
      if (item.publicId !== undefined && item.publicId !== null) {
        if (!isValidPublicId(item.publicId)) {
          throw badRequest('Invalid document publicId', { publicId: item.publicId });
        }
      } else if (!/^https?:\/\//.test(item.url)) {
        throw badRequest('Document url must be an absolute http(s) URL when no publicId is given', { title: item.title });
      }
    }
    await productsRepository.replaceDocuments(
      productId,
      items.map((i) => ({
        kind: i.kind,
        title: i.title,
        url: i.url,
        publicId: i.publicId ?? null,
        sizeBytes: i.sizeBytes ?? null,
      })),
      tx,
    );
    await writeAudit(actorId, 'product.documents.replace', 'product', productId, { count: items.length }, ip, tx);
  });
  afterProductWrite(await mustFindProduct(productId));
  const documents = await productsRepository.listDocumentsByProduct(productId);
  return documents.map((d) => ({
    id: d.id,
    kind: d.kind,
    title: d.title,
    url: d.publicId !== null ? `/media/${d.publicId}` : d.url,
    sizeBytes: d.sizeBytes,
  }));
}

/** PUT /admin/products/:id/price-tiers/:variantId — REPLACES the tier list. */
async function replacePriceTiers(
  actorId: string,
  productId: string,
  variantId: string,
  tiers: PriceTiersInput,
  ip: string | null,
): Promise<PriceTierDto[]> {
  await withTransaction(async (tx) => {
    await mustFindProduct(productId, tx);
    await mustFindVariantOfProduct(productId, variantId, tx);
    await productsRepository.replacePriceTiers(
      variantId,
      tiers.map((t) => ({ minQty: t.minQty, price: new Prisma.Decimal(t.price) })),
      tx,
    );
    await writeAudit(actorId, 'product.price-tiers.replace', 'variant', variantId, { count: tiers.length }, ip, tx);
  });
  afterProductWrite(await mustFindProduct(productId));
  const variant = await productsRepository.findVariantById(variantId);
  return (variant?.priceTiers ?? []).map((t) => ({ minQty: t.minQty, price: t.price.toFixed(2) }));
}

// ── admin: product table ────────────────────────────────────────────────────

/** GET /admin/products — search, filters, pagination, sort. */
async function adminList(
  query: AdminProductListQuery,
  page: { skip: number; take: number; page: number; pageSize: number },
): Promise<{ items: AdminProductListItemDto[]; total: number }> {
  const where: Prisma.ProductWhereInput = { deletedAt: null };
  if (query.q !== undefined) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { variants: { some: { articleNo: { startsWith: query.q, mode: 'insensitive' } } } },
    ];
  }
  if (query.brandId !== undefined) where.brandId = query.brandId;
  if (query.categoryId !== undefined) where.categoryId = query.categoryId;
  if (query.status !== undefined) where.status = query.status;
  if (query.stock === 'low') {
    where.variants = { some: { stockQty: { lt: LOW_STOCK_THRESHOLD }, deletedAt: null } };
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    query.sort === 'name'
      ? [{ name: query.order }, { id: 'asc' }]
      : query.sort === 'updatedAt'
        ? [{ updatedAt: query.order }, { id: 'asc' }]
        : [{ createdAt: query.order }, { id: 'asc' }];

  const [total, rows] = await Promise.all([
    productsRepository.count(where),
    productsRepository.adminList(where, orderBy, page.skip, page.take),
  ]);
  return { items: rows.map(toAdminProductListDto), total };
}


/**
 * Post-write hook for every admin product mutation: nav/counts refresh (the
 * shared catalog hook) plus ISR revalidation of the product page and the
 * homepage blocks that surface products.
 */
function afterProductWrite(product: { slug: string }): void {
  afterCatalogWrite();
  scheduleRevalidate([TAGS.home, TAGS.product(product.slug)]);
}


/** GET /admin/products/:id — full admin detail (works for DRAFT/ARCHIVED too):
 * the admin scalars plus variants/images/documents for the tabbed edit form. */
async function adminDetail(id: string) {
  const row = await productsRepository.findByIdWithNames(id);
  if (row === null) throw notFound('Product not found');
  const [variants, images, documents] = await Promise.all([
    productsRepository.listVariantsWithAttributes(id),
    productsRepository.listImagesByProduct(id),
    productsRepository.listDocumentsByProduct(id),
  ]);
  return {
    ...toAdminProductDto(row),
    variants: variants
      .filter((variant) => variant.deletedAt === null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.articleNo.localeCompare(b.articleNo))
      .map((variant) => toVariantDto(variant)),
    images: toImageDtos(images),
    documents: documents.map((doc) => ({
      id: doc.id,
      kind: doc.kind,
      title: doc.title,
      url: doc.publicId !== null ? mediaUrl(doc.publicId) : doc.url,
      sizeBytes: doc.sizeBytes,
    })),
  };
}

export const productsService = {
  detailBySlug,
  adminDetail,
  variantByArticleNo,
  relatedProducts,
  listByCategory,
  listByBrand,
  createProduct,
  updateProduct,
  deleteProduct,
  bulkUpdate,
  duplicateProduct,
  createVariant,
  updateVariant,
  deleteVariant,
  replaceImages,
  replaceDocuments,
  replacePriceTiers,
  adminList,
};

// Re-export for the openapi module (schema docs need the zod error shape too).
export type { ZodError };
