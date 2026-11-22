// Test DB reset: wipes the tables auth/user flows touch. Users cascade to
// RefreshToken/Address/Cart/Order; Company and audit-adjacent tables cleaned
// explicitly. Also clears the mail outbox so OTP helpers never read stale mail.
//
// Catalog module tables (added with the catalog/attributes/brands modules):
// attribute values before their definitions, products before the categories
// and brands they reference (FKs have no cascade there), slug redirects and
// audit logs are standalone.
import { PrismaClient } from '@prisma/client';
import { readdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const prisma = new PrismaClient();

export async function resetDb(): Promise<void> {
  await prisma.$transaction([
    prisma.authEvent.deleteMany(),
    prisma.otpCode.deleteMany(),
    prisma.order.deleteMany(),
    prisma.orderSequence.deleteMany(),
    prisma.cart.deleteMany(),
    prisma.productAttributeValue.deleteMany(),
    prisma.product.deleteMany(),
    prisma.categoryAttribute.deleteMany(),
    prisma.category.deleteMany(),
    prisma.attributeDefinition.deleteMany(),
    prisma.brand.deleteMany(),
    prisma.slugRedirect.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.company.deleteMany(),
    prisma.user.deleteMany(),
    // Settings rows are mutated by the admin settings round-trip test; clearing
    // them restores DEFAULT_SETTINGS (flat 250 INR shipping etc.) for the
    // cart/checkout suites that run in other workers.
    prisma.setting.deleteMany(),
    // Import jobs survive per-file; their SHA-256 would trigger
    // ALREADY_IMPORTED warnings across suites. Issues cascade; batch items
    // and jobs are removed explicitly.
    prisma.importBatchItem.deleteMany(),
    prisma.importJob.deleteMany(),
  ]);
  const outbox = resolve(process.cwd(), 'var/outbox');
  if (process.env.NODE_ENV === 'test' && existsSync(outbox)) {
    for (const f of readdirSync(outbox)) rmSync(resolve(outbox, f), { force: true });
  }
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
