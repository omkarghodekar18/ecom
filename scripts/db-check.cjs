// Quick dev/test DB sanity check via the BACKEND's generated prisma client.
const { PrismaClient } = require('/home/z/my-project/backend/node_modules/@prisma/client');
const db = process.argv[2] || 'toolhub';
const p = new PrismaClient({
  datasources: { db: { url: `postgresql://postgres@127.0.0.1:5433/${db}` } },
});
(async () => {
  const [products, variants, categories, users, orders, admins] = await Promise.all([
    p.product.count(),
    p.variant.count(),
    p.category.count(),
    p.user.count(),
    p.order.count(),
    p.user.count({ where: { role: 'ADMIN' } }),
  ]);
  console.log(`[${db}] products: ${products} | variants: ${variants} | categories: ${categories} | users: ${users} (admin: ${admins}) | orders: ${orders}`);
  await p.$disconnect();
})().catch((e) => {
  console.error('ERR:', e.message.slice(0, 300));
  process.exit(1);
});
