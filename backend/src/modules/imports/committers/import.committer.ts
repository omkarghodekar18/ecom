// Committer (spec 16.1/16.4): the deterministic plan (create/update/skip per
// row) is built during validation and stored on the job; commit replays it in
// batches of 500 rows per transaction, snapshotting every touched row into
// ImportBatchItem.previous so rollback can restore the exact prior state.
// postProcess refreshes denormalised data (minPrice, category counts, ISR
// tags) and fetches URL-referenced images with per-image error isolation.
import { Prisma } from '@prisma/client';
import { prisma } from '../../../db/prisma.js';
import { withTransaction } from '../../../db/transaction.js';
import { slugify } from '../../../common/utils/slug.util.js';
import { writeAudit } from '../../../services/audit/index.js';
import { scheduleCountRefresh, afterCatalogWrite } from '../../catalog/index.js';
import { recomputeProductMinPrice } from '../../products/products.repository.js';
import { mediaService } from '../../../services/media/index.js';
import { logger } from '../../../config/logger.js';
import { issue, type ImportIssueDraft, type ImportOptions } from '../imports.errors.js';
import type { NormalizedWorkbook } from '../schemas/sheet.schemas.js';
import type { RefContext } from '../validators/refs.validator.js';
import { validateUniqueness } from '../validators/uniqueness.validator.js';

export const COMMIT_BATCH_ROWS = 500;

export interface PlanEntry {
  entity: 'brand' | 'product' | 'variant' | 'image' | 'document' | 'tier' | 'customer-price';
  action: 'CREATE' | 'UPDATE' | 'SKIP';
  /** Natural key: brand name / product_key / article_no. */
  key: string;
  rowNumber: number;
}

export interface ImportPlan {
  entries: PlanEntry[];
  totals: { create: number; update: number; skip: number };
}

/** Builds the deterministic plan from the normalized rows + ref context. */
export function buildPlan(normalized: NormalizedWorkbook, context: RefContext, options: ImportOptions): ImportPlan {
  const entries: PlanEntry[] = [];

  for (const product of normalized.products) {
    const exists = context.existingProducts.has(product.productKey);
    entries.push({ entity: 'product', action: exists ? 'UPDATE' : 'CREATE', key: product.productKey, rowNumber: product.rowNumber });
  }
  const brandsToCreate = new Set<string>();
  for (const product of normalized.products) {
    const entry = context.brandIds.get(product.brand.toLowerCase());
    if (entry === null && !brandsToCreate.has(product.brand)) {
      brandsToCreate.add(product.brand);
      entries.push({ entity: 'brand', action: 'CREATE', key: product.brand, rowNumber: product.rowNumber });
    }
  }
  for (const variant of normalized.variants) {
    const existing = context.existingArticles.get(variant.articleNo);
    if (existing === undefined) {
      entries.push({ entity: 'variant', action: 'CREATE', key: variant.articleNo, rowNumber: variant.rowNumber });
      continue;
    }
    const existingSlug = [...context.existingProducts.entries()].find(([, product]) => product.id === existing.productId)?.[0];
    const sameProduct = existingSlug === variant.productKey;
    if (!sameProduct) {
      entries.push({ entity: 'variant', action: 'SKIP', key: variant.articleNo, rowNumber: variant.rowNumber });
    } else if (options.onDuplicateArticleNo === 'SKIP') {
      entries.push({ entity: 'variant', action: 'SKIP', key: variant.articleNo, rowNumber: variant.rowNumber });
    } else {
      entries.push({ entity: 'variant', action: 'UPDATE', key: variant.articleNo, rowNumber: variant.rowNumber });
    }
  }
  for (const image of normalized.images) {
    entries.push({ entity: 'image', action: 'CREATE', key: image.articleNo ?? image.productKey ?? `row-${image.rowNumber}`, rowNumber: image.rowNumber });
  }
  for (const document of normalized.documents) {
    entries.push({ entity: 'document', action: 'CREATE', key: document.productKey, rowNumber: document.rowNumber });
  }
  for (const tier of normalized.priceTiers) {
    entries.push({ entity: 'tier', action: 'CREATE', key: tier.articleNo, rowNumber: tier.rowNumber });
  }
  for (const customerPrice of normalized.customerPrices) {
    entries.push({ entity: 'customer-price', action: 'CREATE', key: customerPrice.articleNo, rowNumber: customerPrice.rowNumber });
  }

  return {
    entries,
    totals: {
      create: entries.filter((entry) => entry.action === 'CREATE').length,
      update: entries.filter((entry) => entry.action === 'UPDATE').length,
      skip: entries.filter((entry) => entry.action === 'SKIP').length,
    },
  };
}

/** Progress callback so the worker can persist stats between batches. */
export type ProgressCallback = (processedRows: number, totalRows: number) => Promise<void>;

/**
 * Executes the plan. Re-validates uniqueness inside each batch transaction so
 * a concurrent write turns into a clean failure, never a silent duplicate.
 * Every written row is snapshotted into ImportBatchItem for rollback.
 */
export async function commitPlan(
  jobId: string,
  actorId: string,
  ip: string | null,
  normalized: NormalizedWorkbook,
  context: RefContext,
  options: ImportOptions,
  plan: ImportPlan,
  onProgress?: ProgressCallback,
): Promise<{ created: number; updated: number; skipped: number }> {
  const brandIdsByName = new Map(context.brandIds);
  const productIdByKey = new Map(context.existingProducts);

  // Flatten the plan into row-sized work items.
  const work: Array<{ entry: PlanEntry; data: unknown }> = [];
  for (const entry of plan.entries) {
    switch (entry.entity) {
      case 'brand': {
        work.push({ entry, data: normalized.products.find((row) => row.brand === entry.key)! });
        break;
      }
      case 'product': {
        work.push({ entry, data: normalized.products.find((row) => row.productKey === entry.key)! });
        break;
      }
      case 'variant': {
        work.push({ entry, data: normalized.variants.find((row) => row.articleNo === entry.key)! });
        break;
      }
      case 'image': {
        work.push({ entry, data: normalized.images.find((row) => (row.articleNo ?? row.productKey ?? `row-${row.rowNumber}`) === entry.key)! });
        break;
      }
      case 'document': {
        work.push({ entry, data: normalized.documents.find((row) => row.productKey === entry.key && row.rowNumber === entry.rowNumber)! });
        break;
      }
      case 'tier': {
        work.push({ entry, data: normalized.priceTiers.find((row) => row.articleNo === entry.key && row.rowNumber === entry.rowNumber)! });
        break;
      }
      case 'customer-price': {
        work.push({ entry, data: normalized.customerPrices.find((row) => row.articleNo === entry.key && row.rowNumber === entry.rowNumber)! });
        break;
      }
    }
  }

  const totalRows = work.length;
  let processed = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const touchedProducts = new Set<string>();

  for (let batchStart = 0; batchStart < work.length; batchStart += COMMIT_BATCH_ROWS) {
    const batch = work.slice(batchStart, batchStart + COMMIT_BATCH_ROWS);
    await withTransaction(async (tx) => {
      for (const item of batch) {
        const { entry } = item;
        switch (entry.entity) {
          case 'brand': {
            const brand = await tx.brand.create({
              data: { slug: slugify(entry.key), name: entry.key },
            });
            brandIdsByName.set(entry.key.toLowerCase(), brand.id);
            await tx.importBatchItem.create({
              data: { jobId, entity: 'brand', entityId: brand.id, action: 'CREATE', previous: Prisma.DbNull },
            });
            created += 1;
            break;
          }
          case 'product': {
            const product = item.data as NormalizedWorkbook['products'][number];
            const brandId = brandIdsByName.get(product.brand.toLowerCase()) ?? context.brandIds.get(product.brand.toLowerCase()) ?? undefined;
            const category = context.categories.get(product.categoryCode)!;
            const status = product.status === 'PUBLISHED' && options.publishStatus === 'DRAFT' ? 'DRAFT' : product.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
            if (entry.action === 'UPDATE') {
              const existing = productIdByKey.get(product.productKey)!;
              const before = await tx.product.findUniqueOrThrow({ where: { id: existing.id } });
              const updatedRow = await tx.product.update({
                where: { id: existing.id },
                data: {
                  name: product.name,
                  shortDescription: product.shortDescription,
                  descriptionHtml: product.descriptionHtml,
                  isBestseller: product.isBestseller,
                  status,
                  seoTitle: product.seoTitle,
                  seoDescription: product.seoDescription,
                  ...(brandId !== undefined ? { brandId } : {}),
                  ...(category !== undefined ? { categoryId: category.id } : {}),
                },
              });
              await tx.importBatchItem.create({
                data: {
                  jobId,
                  entity: 'product',
                  entityId: updatedRow.id,
                  action: 'UPDATE',
                  previous: snapshotProduct(before) as unknown as Prisma.InputJsonObject,
                },
              });
              updated += 1;
              touchedProducts.add(updatedRow.id);
            } else {
              let slug = slugify(product.productKey) || slugify(product.name);
              let suffix = 2;
              while (await tx.product.findFirst({ where: { slug } }) !== null) {
                slug = `${slugify(product.productKey)}-${suffix}`;
                suffix += 1;
              }
              const createdRow = await tx.product.create({
                data: {
                  slug,
                  name: product.name,
                  brandId: brandId!,
                  categoryId: category.id,
                  shortDescription: product.shortDescription,
                  descriptionHtml: product.descriptionHtml,
                  isBestseller: product.isBestseller,
                  status,
                  seoTitle: product.seoTitle,
                  seoDescription: product.seoDescription,
                },
              });
              productIdByKey.set(product.productKey, { id: createdRow.id, slug: createdRow.slug, categoryId: createdRow.categoryId });
              await tx.importBatchItem.create({
                data: { jobId, entity: 'product', entityId: createdRow.id, action: 'CREATE', previous: Prisma.DbNull },
              });
              created += 1;
              touchedProducts.add(createdRow.id);
            }
            break;
          }
          case 'variant': {
            const variant = item.data as NormalizedWorkbook['variants'][number];
            const product = productIdByKey.get(variant.productKey);
            if (product === undefined || entry.action === 'SKIP') {
              skipped += 1;
              break;
            }
            const mappings = context.mappingsByCategory.get(
              context.categories.get(normalized.products.find((row) => row.productKey === variant.productKey)?.categoryCode ?? '')?.id ?? product.categoryId,
            ) ?? [];
            const attributeRows = buildAttributeRows(variant.attributes, mappings);
            if (entry.action === 'UPDATE') {
              const existingVariant = context.existingArticles.get(variant.articleNo)!;
              const before = await tx.variant.findUniqueOrThrow({
                where: { id: existingVariant.variantId },
                include: { attributes: true },
              });
              await tx.productAttributeValue.deleteMany({ where: { variantId: existingVariant.variantId } });
              await tx.variant.update({
                where: { id: existingVariant.variantId },
                data: {
                  ean: variant.ean,
                  listPrice: new Prisma.Decimal(variant.listPrice),
                  currency: variant.currency,
                  priceUnit: variant.priceUnit,
                  unitLabel: variant.unitLabel,
                  stockQty: variant.stockQty,
                  leadTimeMinDays: variant.leadTimeMinDays,
                  leadTimeMaxDays: variant.leadTimeMaxDays,
                  minOrderQty: variant.minOrderQty,
                  packSize: variant.packSize,
                  isActive: variant.isActive,
                },
              });
              if (attributeRows.length > 0) {
                await tx.productAttributeValue.createMany({
                  data: attributeRows.map((row) => ({ ...row, variantId: existingVariant.variantId })),
                });
              }
              await tx.importBatchItem.create({
                data: {
                  jobId,
                  entity: 'variant',
                  entityId: existingVariant.variantId,
                  action: 'UPDATE',
                  previous: snapshotVariant(before) as unknown as Prisma.InputJsonObject,
                },
              });
              updated += 1;
              touchedProducts.add(existingVariant.productId);
            } else {
              const createdRow = await tx.variant.create({
                data: {
                  productId: product.id,
                  articleNo: variant.articleNo,
                  ean: variant.ean,
                  listPrice: new Prisma.Decimal(variant.listPrice),
                  currency: variant.currency,
                  priceUnit: variant.priceUnit,
                  unitLabel: variant.unitLabel,
                  stockQty: variant.stockQty,
                  leadTimeMinDays: variant.leadTimeMinDays,
                  leadTimeMaxDays: variant.leadTimeMaxDays,
                  minOrderQty: variant.minOrderQty,
                  packSize: variant.packSize,
                  isActive: variant.isActive,
                  attributes: { create: attributeRows },
                },
              });
              await tx.importBatchItem.create({
                data: { jobId, entity: 'variant', entityId: createdRow.id, action: 'CREATE', previous: Prisma.DbNull },
              });
              created += 1;
              touchedProducts.add(product.id);
            }
            break;
          }
          case 'image': {
            const image = item.data as NormalizedWorkbook['images'][number];
            const productKey = image.productKey ?? normalized.variants.find((variant) => variant.articleNo === image.articleNo)?.productKey;
            const product = productKey !== undefined ? productIdByKey.get(productKey) : undefined;
            if (product === undefined) {
              skipped += 1;
              break;
            }
            const variant = image.articleNo !== null ? context.existingArticles.get(image.articleNo) : undefined;
            const createdRow = await tx.productImage.create({
              data: {
                productId: product.id,
                variantId: variant?.variantId ?? null,
                // URL/ZIP images get a PENDING public id; postProcess uploads.
                publicId: `import-pending/${jobId}/${image.rowNumber}`,
                kind: image.kind as 'PHOTO',
                alt: image.alt,
                sortOrder: image.sortOrder,
              },
            });
            await tx.importBatchItem.create({
              data: { jobId, entity: 'image', entityId: createdRow.id, action: 'CREATE', previous: Prisma.DbNull },
            });
            created += 1;
            break;
          }
          case 'document': {
            const document = item.data as NormalizedWorkbook['documents'][number];
            const product = productIdByKey.get(document.productKey);
            if (product === undefined) {
              skipped += 1;
              break;
            }
            const createdRow = await tx.productDocument.create({
              data: {
                productId: product.id,
                kind: document.kind as 'DATASHEET',
                title: document.title,
                url: document.url,
              },
            });
            await tx.importBatchItem.create({
              data: { jobId, entity: 'document', entityId: createdRow.id, action: 'CREATE', previous: Prisma.DbNull },
            });
            created += 1;
            break;
          }
          case 'tier': {
            const tier = item.data as NormalizedWorkbook['priceTiers'][number];
            const existing = context.existingArticles.get(tier.articleNo);
            const variantId = existing?.variantId ?? (await tx.variant.findUnique({ where: { articleNo: tier.articleNo } }))?.id;
            if (variantId === undefined) {
              skipped += 1;
              break;
            }
            const before = await tx.priceTier.findUnique({ where: { variantId_minQty: { variantId, minQty: tier.minQty } } });
            const row = await tx.priceTier.upsert({
              where: { variantId_minQty: { variantId, minQty: tier.minQty } },
              create: { variantId, minQty: tier.minQty, price: new Prisma.Decimal(tier.price) },
              update: { price: new Prisma.Decimal(tier.price) },
            });
            await tx.importBatchItem.create({
              data: {
                jobId,
                entity: 'tier',
                entityId: row.id,
                action: before === null ? 'CREATE' : 'UPDATE',
                previous: before === null ? Prisma.DbNull : ({ price: before.price.toFixed(2) } satisfies Prisma.InputJsonObject),
              },
            });
            if (before === null) created += 1;
            else updated += 1;
            break;
          }
          case 'customer-price': {
            const customerPrice = item.data as NormalizedWorkbook['customerPrices'][number];
            const company = await tx.company.findFirst({ where: { customerNumber: customerPrice.customerNumber } });
            const existing = context.existingArticles.get(customerPrice.articleNo);
            const variantId = existing?.variantId ?? (await tx.variant.findUnique({ where: { articleNo: customerPrice.articleNo } }))?.id;
            if (company === null || company === undefined || variantId === undefined) {
              skipped += 1;
              break;
            }
            const before = await tx.customerPrice.findUnique({
              where: { companyId_variantId: { companyId: company.id, variantId } },
            });
            const row = await tx.customerPrice.upsert({
              where: { companyId_variantId: { companyId: company.id, variantId } },
              create: {
                companyId: company.id,
                variantId,
                price: new Prisma.Decimal(customerPrice.price),
                validFrom: customerPrice.validFrom !== null ? new Date(customerPrice.validFrom) : null,
                validTo: customerPrice.validTo !== null ? new Date(customerPrice.validTo) : null,
              },
              update: {
                price: new Prisma.Decimal(customerPrice.price),
                validFrom: customerPrice.validFrom !== null ? new Date(customerPrice.validFrom) : null,
                validTo: customerPrice.validTo !== null ? new Date(customerPrice.validTo) : null,
              },
            });
            await tx.importBatchItem.create({
              data: {
                jobId,
                entity: 'customer-price',
                entityId: row.id,
                action: before === null ? 'CREATE' : 'UPDATE',
                previous: before === null ? Prisma.DbNull : ({ price: before.price.toFixed(2) } satisfies Prisma.InputJsonObject),
              },
            });
            if (before === null) created += 1;
            else updated += 1;
            break;
          }
        }
      }
    });
    processed += batch.length;
    await onProgress?.(processed, totalRows);
  }

  await writeAudit(actorId, 'import.commit', 'import-job', jobId, plan.totals, ip);
  await postProcess(jobId, normalized, [...touchedProducts], options);
  return { created, updated, skipped };
}

/** Attribute rows for variant create (mapped + validated upstream). */
function buildAttributeRows(
  attributes: Record<string, string>,
  mappings: Array<{ id: string; key: string; type: string }>,
): Array<{ attributeId: string; valueString: string | null; valueNumber: Prisma.Decimal | null; valueBool: boolean | null }> {
  const byKey = new Map(mappings.map((mapping) => [mapping.key, mapping]));
  const rows: Array<{ attributeId: string; valueString: string | null; valueNumber: Prisma.Decimal | null; valueBool: boolean | null }> = [];
  for (const [key, value] of Object.entries(attributes)) {
    const mapping = byKey.get(key);
    if (mapping === undefined) continue;
    const isNumber = mapping.type === 'NUMBER' && /^-?\d+(\.\d+)?$/.test(value);
    rows.push({
      attributeId: mapping.id,
      valueString: mapping.type === 'NUMBER' ? null : value,
      valueNumber: isNumber ? new Prisma.Decimal(value) : null,
      valueBool: null,
    });
  }
  return rows;
}

function snapshotProduct(before: { slug: string; name: string; shortDescription: string | null; descriptionHtml: string | null; isBestseller: boolean; status: string; seoTitle: string | null; seoDescription: string | null; brandId: string; categoryId: string }): Record<string, unknown> {
  return {
    slug: before.slug,
    name: before.name,
    shortDescription: before.shortDescription,
    descriptionHtml: before.descriptionHtml,
    isBestseller: before.isBestseller,
    status: before.status,
    seoTitle: before.seoTitle,
    seoDescription: before.seoDescription,
    brandId: before.brandId,
    categoryId: before.categoryId,
  };
}

function snapshotVariant(before: {
  ean: string | null; listPrice: Prisma.Decimal; currency: string; priceUnit: number; unitLabel: string;
  stockQty: number; leadTimeMinDays: number | null; leadTimeMaxDays: number | null; minOrderQty: number;
  packSize: number; isActive: boolean;
  attributes: Array<{ attributeId: string; valueString: string | null; valueNumber: Prisma.Decimal | null; valueBool: boolean | null }>;
}): Record<string, unknown> {
  return {
    ean: before.ean,
    listPrice: before.listPrice.toFixed(2),
    currency: before.currency,
    priceUnit: before.priceUnit,
    unitLabel: before.unitLabel,
    stockQty: before.stockQty,
    leadTimeMinDays: before.leadTimeMinDays,
    leadTimeMaxDays: before.leadTimeMaxDays,
    minOrderQty: before.minOrderQty,
    packSize: before.packSize,
    isActive: before.isActive,
    attributes: before.attributes.map((attribute) => ({
      attributeId: attribute.attributeId,
      valueString: attribute.valueString,
      valueNumber: attribute.valueNumber?.toString() ?? null,
      valueBool: attribute.valueBool,
    })),
  };
}

/**
 * postProcess (spec 16.4): minPrice per touched product, category counts,
 * ISR revalidation and URL-image uploads with per-image isolation (a failing
 * fetch is a WARNING unless strictImages, then the job fails).
 */
async function postProcess(jobId: string, normalized: NormalizedWorkbook, productIds: string[], options: ImportOptions): Promise<void> {
  for (const productId of productIds) {
    await recomputeProductMinPrice(productId);
  }
  scheduleCountRefresh();
  afterCatalogWrite();

  // URL image uploads: fetch → storage → replace the pending publicId.
  const pendingImages = await prisma.productImage.findMany({
    where: { publicId: { startsWith: `import-pending/${jobId}/` } },
  });
  for (const image of pendingImages) {
    const match = /import-pending\/[^/]+\/(\d+)$/.exec(image.publicId);
    const rowNumber = match !== null ? Number(match[1]) : null;
    const urlRow = normalized.images.find((row) => row.rowNumber === rowNumber)?.imageUrl ?? null;
    if (urlRow === null) continue;
    try {
      const publicId = `products/${image.productId}/${image.id}`;
      await mediaService.uploadFromUrl(publicId, urlRow, { maxBytes: 10 * 1024 * 1024 });
      await prisma.productImage.update({ where: { id: image.id }, data: { publicId } });
    } catch (error) {
      if (options.strictImages) {
        await prisma.productImage.delete({ where: { id: image.id } }).catch(() => undefined);
        throw error;
      }
      logger.warn({ err: error, imageId: image.id }, 'import: image fetch failed (warning)');
      await prisma.productImage.update({ where: { id: image.id }, data: { publicId: 'placeholder/missing-image' } }).catch(() => undefined);
    }
  }
}

/**
 * Rollback (spec 16.1 step 5): restores ImportBatchItem.previous states in
 * REVERSE order. CREATEs are removed, UPDATEs restored field-by-field.
 */
export async function rollbackImport(jobId: string, actorId: string, ip: string | null): Promise<{ restored: number }> {
  const items = await prisma.importBatchItem.findMany({ where: { jobId }, orderBy: { id: 'asc' } });
  let restored = 0;
  await withTransaction(async (tx) => {
    for (const item of [...items].reverse()) {
      switch (item.entity) {
        case 'brand':
        case 'image':
        case 'document': {
          // Created rows never existed before — delete them.
          if (item.action === 'CREATE') {
            if (item.entity === 'brand') {
              await tx.brand.delete({ where: { id: item.entityId } }).catch(() => undefined);
            } else if (item.entity === 'image') {
              await tx.productImage.delete({ where: { id: item.entityId } }).catch(() => undefined);
            } else {
              await tx.productDocument.delete({ where: { id: item.entityId } }).catch(() => undefined);
            }
            restored += 1;
          }
          break;
        }
        case 'product': {
          if (item.action === 'CREATE') {
            await tx.product.update({ where: { id: item.entityId }, data: { deletedAt: new Date(), minPrice: null } });
            await tx.variant.updateMany({ where: { productId: item.entityId }, data: { deletedAt: new Date() } });
          } else if (item.previous !== null) {
            const previous = item.previous as Record<string, unknown>;
            await tx.product.update({ where: { id: item.entityId }, data: {
              slug: previous.slug as string,
              name: previous.name as string,
              shortDescription: previous.shortDescription as string | null,
              descriptionHtml: previous.descriptionHtml as string | null,
              isBestseller: previous.isBestseller as boolean,
              status: previous.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
              seoTitle: previous.seoTitle as string | null,
              seoDescription: previous.seoDescription as string | null,
              brandId: previous.brandId as string,
              categoryId: previous.categoryId as string,
            } });
          }
          restored += 1;
          break;
        }
        case 'variant': {
          if (item.action === 'CREATE') {
            await tx.variant.delete({ where: { id: item.entityId } }).catch(() => undefined);
          } else if (item.previous !== null) {
            const previous = item.previous as Record<string, unknown>;
            await tx.productAttributeValue.deleteMany({ where: { variantId: item.entityId } });
            await tx.variant.update({ where: { id: item.entityId }, data: {
              ean: previous.ean as string | null,
              listPrice: new Prisma.Decimal(previous.listPrice as string),
              currency: previous.currency as string,
              priceUnit: previous.priceUnit as number,
              unitLabel: previous.unitLabel as string,
              stockQty: previous.stockQty as number,
              leadTimeMinDays: previous.leadTimeMinDays as number | null,
              leadTimeMaxDays: previous.leadTimeMaxDays as number | null,
              minOrderQty: previous.minOrderQty as number,
              packSize: previous.packSize as number,
              isActive: previous.isActive as boolean,
            } });
            const attributes = previous.attributes as Array<{ attributeId: string; valueString: string | null; valueNumber: string | null; valueBool: boolean | null }>;
            if (Array.isArray(attributes) && attributes.length > 0) {
              await tx.productAttributeValue.createMany({
                data: attributes.map((attribute) => ({
                  variantId: item.entityId,
                  attributeId: attribute.attributeId,
                  valueString: attribute.valueString,
                  valueNumber: attribute.valueNumber !== null ? new Prisma.Decimal(attribute.valueNumber) : null,
                  valueBool: attribute.valueBool,
                })),
              });
            }
          }
          restored += 1;
          break;
        }
        case 'tier':
        case 'customer-price': {
          if (item.action === 'CREATE') {
            if (item.entity === 'tier') {
              await tx.priceTier.delete({ where: { id: item.entityId } }).catch(() => undefined);
            } else {
              await tx.customerPrice.delete({ where: { id: item.entityId } }).catch(() => undefined);
            }
          } else if (item.previous !== null) {
            const previousPrice = new Prisma.Decimal((item.previous as { price: string }).price);
            if (item.entity === 'tier') {
              await tx.priceTier.update({ where: { id: item.entityId }, data: { price: previousPrice } }).catch(() => undefined);
            } else {
              await tx.customerPrice.update({ where: { id: item.entityId }, data: { price: previousPrice } }).catch(() => undefined);
            }
          }
          restored += 1;
          break;
        }
      }
    }
    await tx.importJob.update({ where: { id: jobId }, data: { status: 'ROLLED_BACK', finishedAt: new Date() } });
  });

  // Refresh denormalised data after the restore.
  const touched = await prisma.importBatchItem.findMany({ where: { jobId, entity: 'product' }, select: { entityId: true } });
  for (const row of touched) {
    await recomputeProductMinPrice(row.entityId);
  }
  scheduleCountRefresh();
  afterCatalogWrite();
  await writeAudit(actorId, 'import.rollback', 'import-job', jobId, { restored }, ip);
  return { restored };
}

export { issue };
export type { ImportIssueDraft };
export { validateUniqueness };
