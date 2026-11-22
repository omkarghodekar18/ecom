// Layer 3 — referential validation (spec 16.3): category exists/active/leaf,
// brand policy, product_key resolution (file → DB by slug), attribute columns
// mapped to the category, enum/number/unit correctness, required + variant-
// axis attributes and axis-combination uniqueness within each product.
import { prisma } from '../../../db/prisma.js';
import { catalogRepository, type CategoryRow } from '../../catalog/index.js';
import { brandsRepository } from '../../brands/index.js';
import { attributesService } from '../../attributes/index.js';
import type { CategoryAttributeDto } from '../../../shared/dto/catalog.dto.js';
import { issue, type ImportIssueDraft, type ImportOptions } from '../imports.errors.js';
import type { NormalizedWorkbook } from '../schemas/sheet.schemas.js';

export interface RefContext {
  /** category_code → row. */
  categories: Map<string, CategoryRow>;
  /** Leaf check results per category id (child count > 0 → not a leaf). */
  liveChildrenByCategory: Map<string, number>;
  /** brand name (lowercase) → id | null (null = to be created) | undefined (missing + no create). */
  brandIds: Map<string, string | null | undefined>;
  /** category id → effective attribute mappings. */
  mappingsByCategory: Map<string, CategoryAttributeDto[]>;
  /** product_key → existing product (when the key matches a live product slug). */
  existingProducts: Map<string, { id: string; slug: string; categoryId: string }>;
  /** article_no → { variantId, productId } for articles already in the DB. */
  existingArticles: Map<string, { variantId: string; productId: string }>;
  /** ean → variantId for EANs already in the DB. */
  existingEans: Map<string, string>;
  /** article_no → axis signature of existing variants (per product). */
  existingAxisSignatures: Map<string, Map<string, string>>;
}

/** Loads every referenced row in bulk (one query per dimension, no N+1). */
export async function buildRefContext(normalized: NormalizedWorkbook, options: ImportOptions): Promise<RefContext> {
  const categoryCodes = new Set(normalized.products.map((row) => row.categoryCode));
  const brandNames = new Set(normalized.products.map((row) => row.brand));
  const productKeys = new Set([...normalized.products.map((row) => row.productKey), ...normalized.variants.map((row) => row.productKey)]);

  const categories = new Map<string, CategoryRow>();
  for (const code of categoryCodes) {
    const row = code === '' ? null : await catalogRepository.findByCode(code);
    if (row !== null) categories.set(code, row);
  }
  const liveChildrenByCategory = new Map<string, number>();
  for (const category of categories.values()) {
    liveChildrenByCategory.set(category.id, await catalogRepository.countLiveChildren(category.id));
  }

  const brandIds = new Map<string, string | null | undefined>();
  for (const name of brandNames) {
    const row = name === '' ? null : await brandsRepository.findByName(name);
    brandIds.set(name.toLowerCase(), row?.id ?? (options.createMissingBrands ? null : undefined));
  }

  const mappingsByCategory = new Map<string, CategoryAttributeDto[]>();
  for (const category of categories.values()) {
    mappingsByCategory.set(category.id, await attributesService.effectiveMappingsForCategory(category));
  }

  const existingProducts = new Map<string, { id: string; slug: string; categoryId: string }>();
  const existingArticles = new Map<string, { variantId: string; productId: string }>();
  const existingEans = new Map<string, string>();
  const existingAxisSignatures = new Map<string, Map<string, string>>();

  const slugs = [...productKeys].filter((key) => key !== '');
  if (slugs.length > 0) {
    const rows = await prisma.product.findMany({
      where: { slug: { in: slugs }, deletedAt: null },
      select: { id: true, slug: true, categoryId: true },
    });
    for (const row of rows) existingProducts.set(row.slug, row);
  }
  const articles = [...new Set(normalized.variants.map((row) => row.articleNo).filter((articleNo) => articleNo !== ''))];
  for (let index = 0; index < articles.length; index += 500) {
    const chunk = articles.slice(index, index + 500);
    const rows = await prisma.variant.findMany({
      where: { articleNo: { in: chunk }, deletedAt: null },
      include: { attributes: true, product: { select: { slug: true } } },
    });
    for (const row of rows) {
      existingArticles.set(row.articleNo, { variantId: row.id, productId: row.productId });
      if (row.ean !== null) existingEans.set(row.ean, row.id);
      const signature = axisSignature(row.attributes);
      if (signature !== null) {
        const perProduct = existingAxisSignatures.get(row.product.slug) ?? new Map<string, string>();
        perProduct.set(row.articleNo, signature);
        existingAxisSignatures.set(row.product.slug, perProduct);
      }
    }
  }
  const eans = [...new Set(normalized.variants.map((row) => row.ean).filter((ean): ean is string => ean !== null))];
  if (eans.length > 0) {
    const rows = await prisma.variant.findMany({ where: { ean: { in: eans } }, select: { ean: true, id: true, articleNo: true } });
    for (const row of rows) {
      if (!existingEans.has(row.ean!)) existingEans.set(row.ean!, row.id);
    }
  }

  return { categories, liveChildrenByCategory, brandIds, mappingsByCategory, existingProducts, existingArticles, existingEans, existingAxisSignatures };
}

/** Signature of stored attribute values for axis comparison. */
export function axisSignature(attributes: Array<{ attributeId: string; valueString: string | null; valueNumber: { toString(): string } | null; valueBool: boolean | null }>): string | null {
  if (attributes.length === 0) return null;
  return attributes
    .map((attribute) => `${attribute.attributeId}:${attribute.valueString ?? ''}|${attribute.valueNumber?.toString() ?? ''}|${attribute.valueBool ?? ''}`)
    .sort()
    .join(';');
}

/** L3 checks. Mutates nothing; returns issues. */
export function validateRefs(normalized: NormalizedWorkbook, context: RefContext): ImportIssueDraft[] {
  const issues: ImportIssueDraft[] = [];
  const productKeysInFile = new Set(normalized.products.map((row) => row.productKey));

  // ── products ────────────────────────────────────────────────────────────
  for (const product of normalized.products) {
    const category = context.categories.get(product.categoryCode);
    if (category === undefined) {
      issues.push(issue.error('Products', product.rowNumber, 'CATEGORY_NOT_FOUND', undefined, 'category_code', product.categoryCode));
      continue;
    }
    if (!category.isActive) {
      issues.push(issue.error('Products', product.rowNumber, 'CATEGORY_NOT_ACTIVE', undefined, 'category_code'));
    }
    if ((context.liveChildrenByCategory.get(category.id) ?? 0) > 0) {
      issues.push(issue.error('Products', product.rowNumber, 'CATEGORY_NOT_LEAF', undefined, 'category_code'));
    }
    const brandEntry = context.brandIds.get(product.brand.toLowerCase());
    if (brandEntry === undefined) {
      // undefined = not found and createMissingBrands = off.
      issues.push(issue.error('Products', product.rowNumber, 'BRAND_NOT_FOUND', undefined, 'brand', product.brand));
    }
    const existing = context.existingProducts.get(product.productKey);
    if (existing !== undefined && existing.categoryId !== category.id) {
      // Updating a product into a different category is allowed (move) but the
      // attribute mapping may change — re-check mappings against the TARGET.
      const mappings = context.mappingsByCategory.get(category.id) ?? [];
      issues.push(...checkAttributes(mappings, product.rowNumber, product.productKey, normalized, context, true));
    }
  }

  // ── variants ────────────────────────────────────────────────────────────
  const perProductAxis = new Map<string, Map<string, string>>(); // productKey → signature → articleNo
  for (const variant of normalized.variants) {
    const productRow = normalized.products.find((row) => row.productKey === variant.productKey);
    const existing = context.existingProducts.get(variant.productKey);
    if (productRow === undefined && existing === undefined) {
      issues.push(issue.error('Variants', variant.rowNumber, 'PRODUCT_KEY_MISSING', undefined, 'product_key', variant.productKey));
      continue;
    }
    const categoryId = productRow !== undefined ? (context.categories.get(productRow.categoryCode)?.id ?? null) : existing!.categoryId;
    const mappings = categoryId !== null ? (context.mappingsByCategory.get(categoryId) ?? []) : [];
    issues.push(...checkAttributes(mappings, variant.rowNumber, variant.productKey, normalized, context, false, variant, perProductAxis));
  }

  // ── images / documents / tiers / customer prices reference products ─────
  for (const image of normalized.images) {
    if (image.articleNo === null && image.productKey === null) {
      issues.push(issue.error('Images', image.rowNumber, 'CELL_REQUIRED', 'article_no or product_key is required.', 'article_no'));
    }
    if (image.productKey !== null && image.articleNo === null) {
      const inFile = productKeysInFile.has(image.productKey) || context.existingProducts.has(image.productKey);
      if (!inFile) issues.push(issue.error('Images', image.rowNumber, 'PRODUCT_KEY_MISSING', undefined, 'product_key', image.productKey));
    }
  }
  for (const document of normalized.documents) {
    const inFile = productKeysInFile.has(document.productKey) || context.existingProducts.has(document.productKey);
    if (!inFile) issues.push(issue.error('Documents', document.rowNumber, 'PRODUCT_KEY_MISSING', undefined, 'product_key', document.productKey));
  }
  const articleSet = new Set([...normalized.variants.map((row) => row.articleNo), ...context.existingArticles.keys()]);
  for (const tier of normalized.priceTiers) {
    if (!articleSet.has(tier.articleNo)) {
      issues.push(issue.error('PriceTiers', tier.rowNumber, 'PRODUCT_KEY_MISSING', `article_no '${tier.articleNo}' is unknown.`, 'article_no', tier.articleNo));
    }
  }
  for (const customerPrice of normalized.customerPrices) {
    if (!articleSet.has(customerPrice.articleNo)) {
      issues.push(issue.error('CustomerPrices', customerPrice.rowNumber, 'PRODUCT_KEY_MISSING', `article_no '${customerPrice.articleNo}' is unknown.`, 'article_no', customerPrice.articleNo));
    }
  }
  return issues;
}

/** Attribute checks shared by the product row (coverage) and variant rows. */
function checkAttributes(
  mappings: CategoryAttributeDto[],
  rowNumber: number,
  productKey: string,
  normalized: NormalizedWorkbook,
  context: RefContext,
  productRowOnly: boolean,
  variant?: { rowNumber: number; articleNo: string; attributes: Record<string, string> },
  perProductAxis?: Map<string, Map<string, string>>,
): ImportIssueDraft[] {
  const issues: ImportIssueDraft[] = [];
  const byKey = new Map(mappings.map((mapping) => [mapping.key, mapping]));
  void productKey;
  void context;

  if (productRowOnly) {
    // Coverage preview: are all attr: columns of this product's variants known?
    const columns = new Set<string>();
    for (const row of normalized.variants) {
      if (row.productKey === productKey) for (const key of Object.keys(row.attributes)) columns.add(key);
    }
    for (const key of columns) {
      if (!byKey.has(key)) {
        issues.push(issue.error('Variants', rowNumber, 'ATTRIBUTE_NOT_MAPPED', `attr:${key} is not mapped to this category.`, `attr:${key}`));
      }
    }
    return issues;
  }

  const attributes = variant!.attributes;
  for (const [key, value] of Object.entries(attributes)) {
    const mapping = byKey.get(key);
    if (mapping === undefined) {
      issues.push(issue.error('Variants', variant!.rowNumber, 'ATTRIBUTE_NOT_MAPPED', `attr:${key} is not mapped to this category.`, `attr:${key}`));
      continue;
    }
    if (mapping.type === 'ENUM' && mapping.enumValues !== null && !mapping.enumValues.includes(value)) {
      issues.push(issue.error('Variants', variant!.rowNumber, 'ENUM_VALUE_INVALID', `'${value}' is not in ${mapping.label}'s enum list.`, `attr:${key}`, value));
    }
    if (mapping.type === 'NUMBER') {
      if (!/^-?\d+(\.\d+)?$/.test(value)) {
        issues.push(issue.error('Variants', variant!.rowNumber, 'NUMBER_ATTRIBUTE_INVALID', undefined, `attr:${key}`, value));
      } else if (mapping.unit !== null && /\d\s*(mm|cm|m|°)/i.test(value) && !value.includes(mapping.unit)) {
        issues.push(issue.warning('Variants', variant!.rowNumber, 'UNIT_MISMATCH', `Value '${value}' does not carry unit ${mapping.unit}.`, `attr:${key}`, value));
      }
    }
  }
  for (const mapping of mappings) {
    if (mapping.isRequired && attributes[mapping.key] === undefined) {
      issues.push(issue.error('Variants', variant!.rowNumber, 'REQUIRED_ATTRIBUTE_MISSING', `${mapping.label} is required for this category.`, `attr:${mapping.key}`));
    }
    if (mapping.isVariantAxis && attributes[mapping.key] === undefined) {
      issues.push(issue.error('Variants', variant!.rowNumber, 'VARIANT_AXIS_MISSING', `${mapping.label} is a variant axis.`, `attr:${mapping.key}`));
    }
  }

  // Axis-combination uniqueness within the product (file + DB).
  const axisKeys = mappings.filter((mapping) => mapping.isVariantAxis).map((mapping) => mapping.key);
  if (axisKeys.length > 0 && perProductAxis !== undefined) {
    const signature = axisKeys.map((key) => `${key}=${attributes[key] ?? ''}`).sort().join(';');
    const perProduct = perProductAxis.get(productKey) ?? new Map<string, string>();
    const clashArticle = perProduct.get(signature);
    if (clashArticle !== undefined) {
      issues.push(issue.error('Variants', variant!.rowNumber, 'AXIS_DUPLICATE', `Same axis combination as '${clashArticle}'.`, undefined, signature));
    } else {
      perProduct.set(signature, variant!.articleNo);
      perProductAxis!.set(productKey, perProduct);
    }
  }
  return issues;
}
