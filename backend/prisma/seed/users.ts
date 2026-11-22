// Users seed (spec Section 22): the env-driven admin, a staff account, the
// demo B2B company with its buyer (plus customer-specific prices on the
// flagship family) and a B2C account. All accounts are verified and active;
// passwords are argon2id hashes via the shared util. Idempotent: upserts by
// email / customerNumber / (companyId, variantId).
import { hashPassword } from '../../src/common/utils/argon2.util.js';
import { getEnv } from '../../src/config/env.js';
import type { Transaction } from '../../src/db/transaction-types.js';
import { FLAGSHIP_SLUG } from './products.js';
import { round2 } from './util.js';

export interface SeedUsersResult {
  users: number;
  companies: number;
  customerPrices: number;
}

export async function seedUsers(tx: Transaction): Promise<SeedUsersResult> {
  const env = getEnv();
  const now = new Date();
  const [adminHash, staffHash, customerHash] = await Promise.all([
    hashPassword(env.SEED_ADMIN_PASSWORD),
    hashPassword('Staff123!secure'),
    hashPassword('Customer123!secure'),
  ]);

  const company = await tx.company.upsert({
    where: { customerNumber: 'CUST-00001' },
    create: { name: 'Kumar Precision Works', customerNumber: 'CUST-00001', gstin: '29ABCDE1234F1Z5' },
    update: { name: 'Kumar Precision Works', gstin: '29ABCDE1234F1Z5' },
  });

  const userDefs = [
    { email: env.SEED_ADMIN_EMAIL, passwordHash: adminHash, role: 'ADMIN' as const, type: 'B2B' as const, firstName: 'Ananya', lastName: 'Sharma', companyId: null as string | null },
    { email: 'staff@example.com', passwordHash: staffHash, role: 'STAFF' as const, type: 'B2B' as const, firstName: 'Vikram', lastName: 'Iyer', companyId: null as string | null },
    { email: 'b2b@example.com', passwordHash: customerHash, role: 'CUSTOMER' as const, type: 'B2B' as const, firstName: 'Ravi', lastName: 'Kumar', companyId: company.id },
    { email: 'b2c@example.com', passwordHash: customerHash, role: 'CUSTOMER' as const, type: 'B2C' as const, firstName: 'Priya', lastName: 'Nair', companyId: null as string | null },
  ];
  for (const def of userDefs) {
    const data = {
      emailVerifiedAt: now,
      passwordHash: def.passwordHash,
      role: def.role,
      type: def.type,
      firstName: def.firstName,
      lastName: def.lastName,
      companyId: def.companyId,
      isActive: true,
    };
    await tx.user.upsert({ where: { email: def.email }, create: { email: def.email, ...data }, update: data });
  }

  // Customer-specific prices: ~12 % below list on the first 8 flagship variants.
  const flagshipVariants = await tx.variant.findMany({
    where: { product: { slug: FLAGSHIP_SLUG } },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, listPrice: true },
    take: 8,
  });
  for (const variant of flagshipVariants) {
    const price = round2(Number(variant.listPrice) * 0.88);
    await tx.customerPrice.upsert({
      where: { companyId_variantId: { companyId: company.id, variantId: variant.id } },
      create: { companyId: company.id, variantId: variant.id, price },
      update: { price, validFrom: null, validTo: null },
    });
  }

  return { users: userDefs.length, companies: 1, customerPrices: flagshipVariants.length };
}
