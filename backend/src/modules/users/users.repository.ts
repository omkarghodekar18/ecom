// Users repository — profile writes for the authenticated user. Session rows
// live in the auth module's session repository; audit events in auth's.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { Transaction } from '../../db/transaction-types.js';

const userInclude = { company: true } satisfies Prisma.UserInclude;

export type UserWithCompany = Prisma.UserGetPayload<{ include: typeof userInclude }>;

function db(tx?: Transaction): Transaction {
  return tx ?? prisma;
}

export const usersRepository = {
  findUserById(id: string, tx?: Transaction): Promise<UserWithCompany | null> {
    return db(tx).user.findUnique({ where: { id }, include: userInclude });
  },

  updateUser(id: string, data: Prisma.UserUpdateInput, tx?: Transaction): Promise<UserWithCompany> {
    return db(tx).user.update({ where: { id }, data, include: userInclude });
  },
};
