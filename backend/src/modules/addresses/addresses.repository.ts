// Addresses repository — Address rows, always scoped by userId (IDOR safety).
import type { Address, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { Transaction } from '../../db/transaction-types.js';

export type AddressRow = Address;

/** Which default flag an operation targets. */
export type DefaultKind = 'isDefaultShipping' | 'isDefaultBilling';

function db(tx?: Transaction): Transaction {
  return tx ?? prisma;
}

export const addressesRepository = {
  listForUser(userId: string, tx?: Transaction): Promise<AddressRow[]> {
    // No createdAt column on Address; cuid ids are roughly time-ordered.
    return db(tx).address.findMany({ where: { userId }, orderBy: { id: 'asc' } });
  },

  findByIdForUser(id: string, userId: string, tx?: Transaction): Promise<AddressRow | null> {
    return db(tx).address.findFirst({ where: { id, userId } });
  },

  create(data: Prisma.AddressUncheckedCreateInput, tx?: Transaction): Promise<AddressRow> {
    return db(tx).address.create({ data });
  },

  /** Updates only when the row belongs to the user; returns the fresh row or null. */
  async updateForUser(
    id: string,
    userId: string,
    data: Prisma.AddressUncheckedUpdateInput,
    tx?: Transaction,
  ): Promise<AddressRow | null> {
    const res = await db(tx).address.updateMany({ where: { id, userId }, data });
    if (res.count === 0) return null;
    return db(tx).address.findFirst({ where: { id, userId } });
  },

  deleteForUser(id: string, userId: string, tx?: Transaction): Promise<boolean> {
    return db(tx)
      .address.deleteMany({ where: { id, userId } })
      .then((r) => r.count > 0);
  },

  /** Unsets the previous default of one kind — called before promoting a new default. */
  clearDefault(userId: string, kind: DefaultKind, tx?: Transaction): Promise<unknown> {
    if (kind === 'isDefaultShipping') {
      return db(tx).address.updateMany({ where: { userId, isDefaultShipping: true }, data: { isDefaultShipping: false } });
    }
    return db(tx).address.updateMany({ where: { userId, isDefaultBilling: true }, data: { isDefaultBilling: false } });
  },
};
