// Companies repository — B2B company lookups for the customer area.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { Transaction } from '../../db/transaction-types.js';

const companyInclude = {
  users: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
    },
  },
} satisfies Prisma.CompanyInclude;

export type CompanyWithUsers = Prisma.CompanyGetPayload<{ include: typeof companyInclude }>;

function db(tx?: Transaction): Transaction {
  return tx ?? prisma;
}

export const companiesRepository = {
  findById(id: string, tx?: Transaction): Promise<CompanyWithUsers | null> {
    return db(tx).company.findUnique({ where: { id }, include: companyInclude });
  },
};
