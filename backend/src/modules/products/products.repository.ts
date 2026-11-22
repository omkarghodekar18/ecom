// Products repository — the only layer touching Prisma for products,
// variants, product attribute values, images, documents and price tiers in
// this module. Public reads scope to PUBLISHED, non-deleted products with
// active, non-deleted variants; admin write helpers take an optional tx
// client so services can compose atomic flows (variant + values + minPrice)
// via `withTransaction`.
//
// List queries use read-optimised `select` shapes (never full rows); the
// heavy detail include is reserved for the PDP and the variant lookup.
import type {
  AttributeDefinition,
  Category,
  DocKind,
  ImageKind,
  Prisma,
  Product,
  ProductDocument,
  ProductImage,
  Variant,
} from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { Transaction } from '../../db/transaction-types.js';
import type { CategoryAttributeWithAttribute } from '../attributes/attributes.repository.js';

/** Public visibility filter for products (spec 15.x: published + not soft-deleted). */
export const PUBLISHED_PRODUCT: Prisma.ProductWhereInput = { deletedAt: null, status: 'PUBLISHED' };

/** Public visibility filter for variants (active + not soft-deleted). */
export const ACTIVE_VARIANT: Prisma.VariantWhereInput = { deletedAt: null, isActive: true };

// ── read shapes ─────────────────────────────────────────────────────────────

/** Full PDP row: brand, category, ordered images/documents, active variants
 *  with their attribute values (+ definitions) and price tiers. */
const detailInclude = {
  brand: true,
  category: true,
  images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] as Prisma.ProductImageOrderByWithRelationInput[] },
  documents: { orderBy: [{ id: 'asc' }] as Prisma.ProductDocumentOrderByWithRelationInput[] },
  variants: {
    where: ACTIVE_VARIANT,
    orderBy: [{ sortOrder: 'asc' }, { articleNo: 'asc' }] as Prisma.VariantOrderByWithRelationInput[],
    include: {
      attributes: { include: { attribute: true } },
      priceTiers: { orderBy: { minQty: 'asc' } },
    },
  },
} satisfies Prisma.ProductInclude;

export type ProductDetailRow = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;

/** Variant row with attribute values (+ definitions) and price tiers. */
const variantInclude = {
  attributes: { include: { attribute: true } },
  priceTiers: { orderBy: { minQty: 'asc' } },
  product: { select: { id: true, slug: true, status: true, deletedAt: true } },
} satisfies Prisma.VariantInclude;

export type VariantDetailRow = Prisma.VariantGetPayload<{ include: typeof variantInclude }>;

/** Listing row (tile/list views) — only what toListingDto needs. */
const listSelect = {
  id: true,
  slug: true,
  name: true,
  isBestseller: true,
  minPrice: true,
  createdAt: true,
  brand: { select: { name: true, slug: true } },
} satisfies Prisma.ProductSelect;

export type ProductListRow = Prisma.ProductGetPayload<{ select: typeof listSelect }>;

/** Minimal variant columns needed to map a listing row (first article no,
 *  variant count, best availability). */
const variantLiteSelect = {
  id: true,
  productId: true,
  articleNo: true,
  sortOrder: true,
  stockQty: true,
  leadTimeMinDays: true,
  leadTimeMaxDays: true,
} satisfies Prisma.VariantSelect;

export type VariantLiteRow = Prisma.VariantGetPayload<{ select: typeof variantLiteSelect }>;

/** Minimal image columns for the listing tile image. */
const imageLiteSelect = { id: true, productId: true, publicId: true, alt: true } satisfies Prisma.ProductImageSelect;

export type ImageLiteRow = Prisma.ProductImageGetPayload<{ select: typeof imageLiteSelect }>;

/** Attribute value row joined to its owning product (facet counting input). */
export type FacetValueRow = {
  attributeId: string;
  valueString: string | null;
  valueNumber: Prisma.Decimal | null;
  valueBool: boolean | null;
  variant: { productId: string };
};

/** Admin table row: identity + denormalised names + counts, nothing heavier. */
const adminListSelect = {
  id: true,
  slug: true,
  name: true,
  status: true,
  minPrice: true,
  createdAt: true,
  updatedAt: true,
  brand: { select: { name: true } },
  category: { select: { name: true } },
  _count: {
    select: {
      variants: { where: { deletedAt: null } },
      images: true,
    },
  },
} satisfies Prisma.ProductSelect;

export type AdminProductListRow = Prisma.ProductGetPayload<{ select: typeof adminListSelect }>;

/** Admin write result shape (created/updated product with names for the DTO). */
const adminWriteInclude = {
  brand: { select: { name: true } },
  category: { select: { name: true } },
} satisfies Prisma.ProductInclude;

export type AdminProductRow = Prisma.ProductGetPayload<{ include: typeof adminWriteInclude }>;

function db(tx?: Transaction): Transaction {
  return tx ?? prisma;
}

/** One attribute predicate on ProductAttributeValue (see service listing). */
export interface AttributePredicate {
  attributeId: string;
  /** ENUM/STRING: valueString ∈ set. */
  valueStringIn?: string[];
  /** BOOLEAN: exact value. */
  valueBool?: boolean;
  /** NUMBER: inclusive range. */
  valueNumberGte?: number;
  valueNumberLte?: number;
}

/** IN-list chunk size for the attribute-filter step (keeps SQL sane). */
const ID_CHUNK = 500;

function predicateToWhere(p: AttributePredicate): Prisma.ProductAttributeValueWhereInput {
  const where: Prisma.ProductAttributeValueWhereInput = { attributeId: p.attributeId };
  if (p.valueStringIn !== undefined) where.valueString = { in: p.valueStringIn };
  if (p.valueBool !== undefined) where.valueBool = p.valueBool;
  if (p.valueNumberGte !== undefined || p.valueNumberLte !== undefined) {
    where.valueNumber = { gte: p.valueNumberGte, lte: p.valueNumberLte };
  }
  return where;
}

export const productsRepository = {
  // ── public reads ────────────────────────────────────────────────────────

  /** One PUBLISHED, non-deleted product by slug with full detail relations. */
  findPublishedBySlug(slug: string, tx?: Transaction): Promise<ProductDetailRow | null> {
    return db(tx).product.findFirst({ where: { slug, ...PUBLISHED_PRODUCT }, include: detailInclude });
  },

  /** Published identity triple for the related-products lookup. */
  findPublishedRefBySlug(
    slug: string,
    tx?: Transaction,
  ): Promise<{ id: string; categoryId: string; brandId: string } | null> {
    return db(tx).product.findFirst({
      where: { slug, ...PUBLISHED_PRODUCT },
      select: { id: true, categoryId: true, brandId: true },
    });
  },

  /** Variant by exact articleNo (public shape; service checks visibility). */
  findVariantByArticleNo(articleNo: string, tx?: Transaction): Promise<VariantDetailRow | null> {
    return db(tx).variant.findFirst({ where: { articleNo }, include: variantInclude });
  },

  /** Candidate product ids for the listing base filters (published, subtree /
   *  brand scope, brand list, inStock EXISTS on variants). */
  async listIds(where: Prisma.ProductWhereInput, tx?: Transaction): Promise<string[]> {
    const rows = await db(tx).product.findMany({ where, select: { id: true } });
    return rows.map((r) => r.id);
  },

  /**
   * Narrows candidate product ids to those having at least ONE active variant
   * that satisfies ALL predicates at once (AND across attributes, OR inside a
   * value set). Chunks the IN-list so the SQL stays bounded.
   */
  async filterIdsByVariantAttributes(
    productIds: string[],
    predicates: AttributePredicate[],
    tx?: Transaction,
  ): Promise<string[]> {
    if (productIds.length === 0) return [];
    const matched = new Set<string>();
    for (let i = 0; i < productIds.length; i += ID_CHUNK) {
      const chunk = productIds.slice(i, i + ID_CHUNK);
      const rows = await db(tx).variant.findMany({
        where: {
          productId: { in: chunk },
          ...ACTIVE_VARIANT,
          AND: predicates.map((p) => ({ attributes: { some: predicateToWhere(p) } })),
        },
        select: { productId: true },
        distinct: ['productId'],
      });
      for (const row of rows) matched.add(row.productId);
    }
    // Preserve the candidate order (callers page/sort on the final set).
    return productIds.filter((id) => matched.has(id));
  },

  /** Final listing page for `ids`, sorted by the requested order. */
  findPageByIds(
    ids: string[],
    orderBy: Prisma.ProductOrderByWithRelationInput[],
    skip: number,
    take: number,
    tx?: Transaction,
  ): Promise<ProductListRow[]> {
    return db(tx).product.findMany({ where: { id: { in: ids } }, select: listSelect, orderBy, skip, take });
  },

  /**
   * Ids of the category's visible subtree INCLUDING itself: a BFS from the
   * category over ACTIVE, non-deleted nodes — recursion stops at inactive or
   * soft-deleted branches, mirroring refreshCategoryProductCounts. The
   * listing uses this so hidden branches never contribute products.
   */
  async listActiveSubtreeIds(category: Pick<Category, 'id' | 'path'>, tx?: Transaction): Promise<string[]> {
    const rows = await db(tx).category.findMany({
      where: { path: { startsWith: category.path } },
      select: { id: true, parentId: true, isActive: true, deletedAt: true },
    });
    // Live children grouped by parent — dead nodes never make it into the map.
    const liveChildrenOf = new Map<string, string[]>();
    for (const row of rows) {
      if (row.parentId === null || !row.isActive || row.deletedAt !== null) continue;
      const siblings = liveChildrenOf.get(row.parentId);
      if (siblings !== undefined) siblings.push(row.id);
      else liveChildrenOf.set(row.parentId, [row.id]);
    }
    // BFS from the category itself (callers pass an ACTIVE row); children of
    // unvisited nodes never enqueue, so dead branches are pruned for free.
    const ids: string[] = [];
    const queue = [category.id];
    for (let i = 0; i < queue.length; i += 1) {
      const id = queue[i];
      if (id === undefined) continue;
      ids.push(id);
      queue.push(...(liveChildrenOf.get(id) ?? []));
    }
    return ids;
  },

  /** Active, non-deleted variants of the given products (listing mapping). */
  listActiveVariantsLite(productIds: string[], tx?: Transaction): Promise<VariantLiteRow[]> {
    if (productIds.length === 0) return Promise.resolve([]);
    return db(tx).variant.findMany({
      where: { productId: { in: productIds }, ...ACTIVE_VARIANT },
      select: variantLiteSelect,
      orderBy: [{ sortOrder: 'asc' }, { articleNo: 'asc' }],
    });
  },

  /** Images of the given products ordered so "first image" is index 0. */
  listImagesLite(productIds: string[], tx?: Transaction): Promise<ImageLiteRow[]> {
    if (productIds.length === 0) return Promise.resolve([]);
    return db(tx).productImage.findMany({
      where: { productId: { in: productIds } },
      select: imageLiteSelect,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  },

  // ── facet support (spec 12 disjunctive facet counts) ────────────────────

  /** Brand membership of the given products — user brand filter + brand facet. */
  listBrandMembership(
    productIds: string[],
    tx?: Transaction,
  ): Promise<Array<{ id: string; brand: { slug: string; name: string } }>> {
    if (productIds.length === 0) return Promise.resolve([]);
    return db(tx).product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, brand: { select: { slug: true, name: true } } },
    });
  },

  /** Products (of the given set) with ≥1 active, non-deleted, in-stock variant. */
  async listInStockProductIds(productIds: string[], tx?: Transaction): Promise<string[]> {
    if (productIds.length === 0) return [];
    const rows = await db(tx).variant.findMany({
      where: { productId: { in: productIds }, deletedAt: null, isActive: true, stockQty: { gt: 0 } },
      select: { productId: true },
      distinct: ['productId'],
    });
    return rows.map((r) => r.productId);
  },

  /**
   * Attribute value rows of the given products' ACTIVE, non-deleted variants —
   * the raw input for facet counting (products are deduped by the caller).
   */
  listFacetValueRows(
    productIds: string[],
    attributeIds: string[],
    tx?: Transaction,
  ): Promise<FacetValueRow[]> {
    if (productIds.length === 0 || attributeIds.length === 0) return Promise.resolve([]);
    return db(tx).productAttributeValue.findMany({
      where: {
        attributeId: { in: attributeIds },
        variant: { productId: { in: productIds }, deletedAt: null, isActive: true },
      },
      select: {
        attributeId: true,
        valueString: true,
        valueNumber: true,
        valueBool: true,
        variant: { select: { productId: true } },
      },
    });
  },

  /**
   * CategoryAttribute mappings with isFilterable=true across ALL categories,
   * joined with their definitions, ordered for display — the global facet
   * metadata source for scopes without one category's effective mapping
   * (brand listings, full-text search).
   */
  listFilterableMappings(tx?: Transaction): Promise<CategoryAttributeWithAttribute[]> {
    return db(tx).categoryAttribute.findMany({
      where: { isFilterable: true },
      include: { attribute: true },
      orderBy: [{ sortOrder: 'asc' }, { attribute: { key: 'asc' } }],
    });
  },

  /**
   * Related products: same category, PUBLISHED, self excluded — same brand
   * first (newest first inside each bucket), filled up with other brands.
   */
  async listRelatedCandidates(
    categoryId: string,
    brandId: string,
    excludeProductId: string,
    limit: number,
    tx?: Transaction,
  ): Promise<ProductListRow[]> {
    const sameBrand = await db(tx).product.findMany({
      where: { categoryId, ...PUBLISHED_PRODUCT, id: { not: excludeProductId }, brandId },
      select: listSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    if (sameBrand.length >= limit) return sameBrand;
    const others = await db(tx).product.findMany({
      where: {
        categoryId,
        ...PUBLISHED_PRODUCT,
        id: { not: excludeProductId },
        brandId: { not: brandId },
      },
      select: listSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit - sameBrand.length,
    });
    return [...sameBrand, ...others];
  },

  // ── admin reads (any state, never soft-deleted rows) ────────────────────

  findById(id: string, tx?: Transaction): Promise<Product | null> {
    return db(tx).product.findUnique({ where: { id } });
  },

  findByIdWithNames(id: string, tx?: Transaction): Promise<AdminProductRow | null> {
    return db(tx).product.findUnique({ where: { id }, include: adminWriteInclude });
  },

  slugTaken(slug: string, excludeId: string | null, tx?: Transaction): Promise<boolean> {
    return db(tx)
      .product.findFirst({
        where: { slug, ...(excludeId !== null ? { id: { not: excludeId } } : {}) },
        select: { id: true },
      })
      .then((row) => row !== null);
  },

  articleNoTaken(articleNo: string, excludeVariantId: string | null, tx?: Transaction): Promise<boolean> {
    return db(tx)
      .variant.findFirst({
        where: { articleNo, ...(excludeVariantId !== null ? { id: { not: excludeVariantId } } : {}) },
        select: { id: true },
      })
      .then((row) => row !== null);
  },

  eanTaken(ean: string, excludeVariantId: string | null, tx?: Transaction): Promise<boolean> {
    return db(tx)
      .variant.findFirst({
        where: { ean, ...(excludeVariantId !== null ? { id: { not: excludeVariantId } } : {}) },
        select: { id: true },
      })
      .then((row) => row !== null);
  },

  /** Admin table page. */
  adminList(
    where: Prisma.ProductWhereInput,
    orderBy: Prisma.ProductOrderByWithRelationInput[],
    skip: number,
    take: number,
    tx?: Transaction,
  ): Promise<AdminProductListRow[]> {
    return db(tx).product.findMany({ where, select: adminListSelect, orderBy, skip, take });
  },

  count(where: Prisma.ProductWhereInput, tx?: Transaction): Promise<number> {
    return db(tx).product.count({ where });
  },

  /** Non-deleted variants of a product with their attribute values (axis
   *  combination checks + PATCH merges). */
  listVariantsWithAttributes(productId: string, tx?: Transaction): Promise<VariantDetailRow[]> {
    return db(tx).variant.findMany({
      where: { productId, deletedAt: null },
      include: variantInclude,
      orderBy: [{ sortOrder: 'asc' }, { articleNo: 'asc' }],
    });
  },

  findVariantById(variantId: string, tx?: Transaction): Promise<VariantDetailRow | null> {
    return db(tx).variant.findUnique({ where: { id: variantId }, include: variantInclude });
  },

  /** Images of one product in display order (replace-list response). */
  listImagesByProduct(productId: string, tx?: Transaction): Promise<ProductImage[]> {
    return db(tx).productImage.findMany({
      where: { productId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  },

  listDocumentsByProduct(productId: string, tx?: Transaction): Promise<ProductDocument[]> {
    return db(tx).productDocument.findMany({
      where: { productId },
      orderBy: [{ id: 'asc' }],
    });
  },

  /** Variant ids of a product (image variantId validation). */
  async listVariantIds(productId: string, tx?: Transaction): Promise<string[]> {
    const rows = await db(tx).variant.findMany({ where: { productId }, select: { id: true } });
    return rows.map((r) => r.id);
  },

  /** Every attribute definition mapped to at least one category (brand-scope
   *  listing filter validation — keys outside this set are never filterable). */
  async listMappedAttributeDefs(tx?: Transaction): Promise<AttributeDefinition[]> {
    const rows = await db(tx).categoryAttribute.findMany({
      include: { attribute: true },
      orderBy: { attribute: { key: 'asc' } },
    });
    const byId = new Map(rows.map((r) => [r.attributeId, r.attribute]));
    return [...byId.values()];
  },

  // ── writes (tx-aware) ───────────────────────────────────────────────────

  createProduct(data: Prisma.ProductUncheckedCreateInput, tx?: Transaction): Promise<AdminProductRow> {
    return db(tx).product.create({ data, include: adminWriteInclude });
  },

  updateProductById(id: string, data: Prisma.ProductUncheckedUpdateInput, tx?: Transaction): Promise<AdminProductRow> {
    return db(tx).product.update({ where: { id }, data, include: adminWriteInclude });
  },

  /** Soft-deletes the product AND all of its variants in one write set. */
  async softDeleteProduct(id: string, tx?: Transaction): Promise<Product> {
    const now = new Date();
    await db(tx).variant.updateMany({ where: { productId: id, deletedAt: null }, data: { deletedAt: now } });
    return db(tx).product.update({ where: { id }, data: { deletedAt: now, minPrice: null } });
  },

  createVariant(
    data: Prisma.VariantUncheckedCreateInput & {
      attributes?: Prisma.ProductAttributeValueUncheckedCreateNestedManyWithoutVariantInput;
    },
    tx?: Transaction,
  ): Promise<VariantDetailRow> {
    return db(tx).variant.create({ data, include: variantInclude });
  },

  updateVariantById(id: string, data: Prisma.VariantUncheckedUpdateInput, tx?: Transaction): Promise<VariantDetailRow> {
    return db(tx).variant.update({ where: { id }, data, include: variantInclude });
  },

  softDeleteVariant(id: string, tx?: Transaction): Promise<Variant> {
    return db(tx).variant.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  /** REPLACES the variant's attribute values atomically. */
  async replaceVariantAttributes(
    variantId: string,
    rows: Array<{ attributeId: string; valueString?: string; valueNumber?: number; valueBool?: boolean }>,
    tx?: Transaction,
  ): Promise<number> {
    await db(tx).productAttributeValue.deleteMany({ where: { variantId } });
    if (rows.length === 0) return 0;
    const res = await db(tx).productAttributeValue.createMany({
      data: rows.map((row) => ({ ...row, variantId })),
    });
    return res.count;
  },

  /** REPLACES the product's image list (delete removed, insert the rest). */
  async replaceImages(
    productId: string,
    rows: Array<{ publicId: string; kind: ImageKind; alt: string | null; variantId: string | null; sortOrder: number }>,
    tx?: Transaction,
  ): Promise<number> {
    await db(tx).productImage.deleteMany({ where: { productId } });
    if (rows.length === 0) return 0;
    const res = await db(tx).productImage.createMany({
      data: rows.map((row) => ({ ...row, productId })),
    });
    return res.count;
  },

  /** REPLACES the product's document list. */
  async replaceDocuments(
    productId: string,
    rows: Array<{
      kind: DocKind;
      title: string;
      url: string;
      publicId: string | null;
      sizeBytes: number | null;
    }>,
    tx?: Transaction,
  ): Promise<number> {
    await db(tx).productDocument.deleteMany({ where: { productId } });
    if (rows.length === 0) return 0;
    const res = await db(tx).productDocument.createMany({
      data: rows.map((row) => ({ ...row, productId })),
    });
    return res.count;
  },

  /** REPLACES the variant's price tiers (caller validates ordering). */
  async replacePriceTiers(
    variantId: string,
    rows: Array<{ minQty: number; price: Prisma.Decimal }>,
    tx?: Transaction,
  ): Promise<number> {
    await db(tx).priceTier.deleteMany({ where: { variantId } });
    if (rows.length === 0) return 0;
    const res = await db(tx).priceTier.createMany({ data: rows.map((row) => ({ ...row, variantId })) });
    return res.count;
  },

  /** Upserts one PRODUCT slug redirect (spec 13.6; oldPath is unique). */
  upsertSlugRedirect(oldSlug: string, newSlug: string, tx?: Transaction): Promise<unknown> {
    return db(tx).slugRedirect.upsert({
      where: { oldPath: oldSlug },
      create: { type: 'PRODUCT', oldPath: oldSlug, newPath: newSlug },
      update: { newPath: newSlug },
    });
  },
};

/**
 * Shared price maintenance (spec 17 denormalised column): minPrice = MIN(listPrice)
 * over the product's active, non-deleted variants; NULL when none are active.
 * Called inside every variant write transaction.
 */
export async function recomputeProductMinPrice(productId: string, tx?: Transaction): Promise<void> {
  const agg = await db(tx).variant.aggregate({
    where: { productId, ...ACTIVE_VARIANT },
    _min: { listPrice: true },
  });
  await db(tx).product.update({
    where: { id: productId },
    data: { minPrice: agg._min.listPrice ?? null },
  });
}
