// Seeds admin/staff/customer users directly via Prisma (argon2 password hash)
// and signs their access tokens with the auth module's own JWT helper — no
// login round-trips, so suites never touch the auth rate limiter.
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../src/common/utils/argon2.util.js';
import { signAccessToken } from '../../src/common/utils/jwt.util.js';

const prisma = new PrismaClient();

export const SEED_PASSWORD = 'Password123';

export interface SeededUser {
  id: string;
  email: string;
  accessToken: string;
}

export interface SeededUsers {
  admin: SeededUser;
  staff: SeededUser;
  customer: SeededUser;
}

/**
 * Creates one user per role and returns it with a signed Bearer token.
 * `authenticate` verifies the JWT statelessly, so no session row is needed.
 */
export async function seedUsers(): Promise<SeededUsers> {
  const passwordHash = await hashPassword(SEED_PASSWORD);
  const defs = [
    { key: 'admin', email: 'admin@catalog.test', role: 'ADMIN' },
    { key: 'staff', email: 'staff@catalog.test', role: 'STAFF' },
    { key: 'customer', email: 'customer@catalog.test', role: 'CUSTOMER' },
  ] as const;

  const out = {} as SeededUsers;
  for (const def of defs) {
    const user = await prisma.user.create({
      data: {
        email: def.email,
        passwordHash,
        firstName: 'Catalog',
        lastName: 'Test',
        role: def.role,
        type: 'B2C',
        emailVerifiedAt: new Date(),
      },
    });
    out[def.key] = {
      id: user.id,
      email: def.email,
      accessToken: signAccessToken({ id: user.id, role: def.role, type: 'B2C' }, `seed-${def.key}`),
    };
  }
  return out;
}

/** Bearer header factory for a seeded user. */
export const bearer = (user: SeededUser): { Authorization: string } => ({
  Authorization: `Bearer ${user.accessToken}`,
});
