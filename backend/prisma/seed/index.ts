// Seed entry (spec Section 22): categories → brands → attributes+mapping →
// products/variants/attributes/tiers/images → users/companies/prices →
// banners → CMS pages → placeholder assets → maintenance SQL.
// Idempotent: re-running upserts definitions and rebuilds per-product children.
import '../../src/load-env.js';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '../../src/db/prisma.js';
import { logger } from '../../src/config/logger.js';
import { mediaService } from '../../src/services/media/index.js';
import { seedAttributes } from './attributes.js';
import { BANNER_IMAGE_JOBS, seedBanners } from './banners.js';
import { seedBrands } from './brands.js';
import { seedCategories } from './categories.js';
import { CMS_IMAGE_JOBS, seedCmsPages } from './cms-pages.js';
import { FLAGSHIP_SLUG, seedProducts } from './products.js';
import { writeSampleImportWorkbook } from './sample-import.js';
import { seedUsers } from './users.js';

/** Local-adapter uploads root (for the existing-asset count in the summary). */
const UPLOADS_ROOT = resolve(process.cwd(), 'var/uploads');

interface ImageJob {
  publicId: string;
  label: string;
}

async function collectImageJobs(): Promise<ImageJob[]> {
  const rows = await prisma.productImage.findMany({
    select: { publicId: true, alt: true },
    orderBy: { publicId: 'asc' },
  });
  const productJobs = rows.map((r) => ({ publicId: r.publicId, label: r.alt ?? r.publicId }));
  return [...productJobs, ...BANNER_IMAGE_JOBS, ...CMS_IMAGE_JOBS];
}

/** Writes placeholder SVGs for every image job that has no stored asset yet. */
async function generatePlaceholderAssets(jobs: ImageJob[]): Promise<number> {
  let created = 0;
  for (const job of jobs) {
    try {
      if (await mediaService.exists(job.publicId)) continue;
      await mediaService.savePlaceholderImage(job.publicId, job.label);
      created += 1;
    } catch (err) {
      logger.warn({ err, publicId: job.publicId }, 'placeholder generation failed (continuing)');
    }
  }
  return created;
}

/**
 * Maintenance SQL (spec Section 17): subtree product counts and denormalised
 * price-from, recomputed for the whole catalog in two statements.
 */
async function runMaintenanceSql(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    UPDATE "Category" c
    SET "productCount" = (
      SELECT count(*)
      FROM "Product" p
      JOIN "Category" sub ON p."categoryId" = sub.id
      WHERE p.status = 'PUBLISHED'
        AND p."deletedAt" IS NULL
        AND (sub.id = c.id OR sub.path LIKE c.path || '%')
    )`);
  await prisma.$executeRawUnsafe(`
    UPDATE "Product" p
    SET "minPrice" = (
      SELECT MIN(v."listPrice")
      FROM "Variant" v
      WHERE v."productId" = p.id
        AND v."deletedAt" IS NULL
        AND v."isActive" = true
    )`);
}

async function main(): Promise<void> {
  const startedAt = Date.now();

  logger.info('seed: categories');
  const categoryRefs = await seedCategories(prisma);
  const categoryIds = new Map<string, string>();
  for (const [code, ref] of categoryRefs) categoryIds.set(code, ref.id);

  logger.info('seed: brands');
  const brandIds = await seedBrands(prisma);

  logger.info('seed: attributes + category mapping');
  const { definitions, mappings } = await seedAttributes(prisma, categoryIds);
  const attributeIds = new Map<string, string>();
  const attrRows = await prisma.attributeDefinition.findMany({ select: { id: true, key: true } });
  for (const row of attrRows) attributeIds.set(row.key, row.id);

  logger.info('seed: products');
  const productStats = await seedProducts(prisma, categoryIds, brandIds, attributeIds);

  logger.info('seed: users + customer prices');
  const userStats = await seedUsers(prisma);

  logger.info('seed: banners');
  const bannerCount = await seedBanners(prisma);

  logger.info('seed: cms pages');
  const cmsCount = await seedCmsPages(prisma);

  logger.info('seed: placeholder assets');
  const imageJobs = await collectImageJobs();
  const assetsCreated = await generatePlaceholderAssets(imageJobs);

  logger.info('seed: sample import workbook');
  await writeSampleImportWorkbook(resolve(process.cwd(), 'prisma/seed/sample-import.xlsx'));

  logger.info('seed: maintenance SQL (counts + minPrice)');
  await runMaintenanceSql();

  const categoryCount = await prisma.category.count();
  const variantCount = await prisma.variant.count();
  const uploads = readdirSync(resolve(UPLOADS_ROOT, 'catalog/products'), { recursive: true }).filter(
    (f) => String(f).endsWith('.svg'),
  ).length;

  const flagship = await prisma.product.findUnique({
    where: { slug: FLAGSHIP_SLUG },
    select: { _count: { select: { variants: true } }, minPrice: true, isBestseller: true },
  });

   
  console.log(
    [
      '\n=== Seed complete ===',
      `categories:        ${categoryCount}`,
      `brands:            ${brandIds.size}`,
      `attributes:        ${definitions} (${mappings} mappings)`,
      `products:          ${productStats.products}`,
      `variants:          ${variantCount} (attribute values: ${productStats.attributeValues}, tiers: ${productStats.priceTiers})`,
      `product images:    ${productStats.images} rows, ${uploads} SVG files on disk (${assetsCreated} generated this run)`,
      `users:             ${userStats.users} (${userStats.companies} company, ${userStats.customerPrices} customer prices)`,
      `banners:           ${bannerCount}`,
      `cms pages:         ${cmsCount}`,
      `flagship:          ${FLAGSHIP_SLUG} — ${flagship?._count.variants ?? '?'} variants, ` +
        `from INR ${flagship?.minPrice?.toFixed(2) ?? '?'}, bestseller ${flagship?.isBestseller ?? '?'}`,
      `duration:          ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    ].join('\n'),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    logger.error({ err }, 'seed failed');
     
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
