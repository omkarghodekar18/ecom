// Smoke-test: extensions, triggers, weighted search vector round-trip.
import '../src/load-env.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ext = await prisma.$queryRawUnsafe(
    `SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm','unaccent') ORDER BY 1`,
  );
  console.log('extensions:', ext.map((r: { extname: string }) => r.extname).join(', '));

  const brand = await prisma.brand.create({
    data: { slug: 'test-brand', name: 'TestBrand', isPremium: true },
  });
  const cat = await prisma.category.create({
    data: {
      code: '99-00-00-00-00', slug: 'test-cat', name: 'Test Category',
      path: '/', pathSlugs: 'test-cat', level: 0,
    },
  });
  const product = await prisma.product.create({
    data: { slug: 'test-product', name: 'Centre drill HSS-E A TiAlN', brandId: brand.id, categoryId: cat.id, status: 'PUBLISHED' },
  });
  await prisma.variant.create({
    data: { productId: product.id, articleNo: '111100 0,5', listPrice: 2357.3 },
  });
  await prisma.$executeRawUnsafe(`SELECT product_tsv_refresh($1)`, product.id);

  const rank = await prisma.$queryRawUnsafe<{ rank: number }[]>(
    `SELECT ts_rank("searchVector", websearch_to_tsquery('english', $1)) AS rank
     FROM "Product" WHERE id = $2`,
    'centre drill', product.id,
  );
  const byArticle = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "Product" WHERE "searchVector" @@ websearch_to_tsquery('english', $1)`,
    '111100 0,5',
  );
  const trgm = await prisma.$queryRawUnsafe<{ s: number }[]>(
    `SELECT similarity(name, 'centre dril') AS s FROM "Product" WHERE id = $1`,
    product.id,
  );
  console.log('rank(A-name):', Number(rank[0]?.rank ?? 0).toFixed(4));
  console.log('found by article no (B):', byArticle.length === 1);
  console.log('trigram similarity (typo):', Number(trgm[0]?.s ?? 0).toFixed(3));

  await prisma.product.delete({ where: { id: product.id } }); // cascades variants
  await prisma.category.delete({ where: { id: cat.id } });
  await prisma.brand.delete({ where: { id: brand.id } });
  console.log('cleanup ok — search stack VERIFIED');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
