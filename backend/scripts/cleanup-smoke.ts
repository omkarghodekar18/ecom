// Removes leftover rows from smoke-test runs.
import '../src/load-env.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.product.deleteMany({ where: { slug: 'test-product' } });
  await prisma.category.deleteMany({ where: { code: '99-00-00-00-00' } });
  await prisma.brand.deleteMany({ where: { slug: 'test-brand' } });
  console.log('leftovers cleaned');
}

main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
