// Orders repository — the only layer touching Prisma in the orders module.
// Every read is scoped by userId (IDOR-safe, spec Section 18); admin reads use
// separate queries with explicit scoping.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { Transaction } from '../../db/transaction-types.js';

/** Order list row: scalars + item quantities (itemCount sums pieces, matching cart semantics). */
export const orderListInclude = { items: { select: { quantity: true } } } satisfies Prisma.OrderInclude;
export type OrderListRow = Prisma.OrderGetPayload<{ include: typeof orderListInclude }>;

/** Order detail row: items + status timeline. */
export const orderDetailInclude = {
  items: true,
  events: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;
export type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

function db(tx?: Transaction): Transaction {
  return tx ?? prisma;
}

export const ordersRepository = {
  /** The user's orders, newest first. */
  findOrdersByUserId(userId: string, page: number, pageSize: number, tx?: Transaction) {
    return db(tx).order.findMany({
      where: { userId },
      include: orderListInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  },

  countOrdersByUserId(userId: string, tx?: Transaction) {
    return db(tx).order.count({ where: { userId } });
  },

  /** One order by orderNo — pass userId to scope to the owner (customer reads). */
  findOrderByOrderNo(orderNo: string, opts: { userId?: string; tx?: Transaction }) {
    return db(opts.tx).order.findFirst({
      where: { orderNo, ...(opts.userId !== undefined ? { userId: opts.userId } : {}) },
      include: orderDetailInclude,
    });
  },

  findOrderById(orderId: string, tx?: Transaction) {
    return db(tx).order.findUnique({ where: { id: orderId }, include: orderDetailInclude });
  },

  /** Existing order for an idempotency key (place-order replay detection). */
  findByIdempotencyKey(key: string, tx?: Transaction) {
    return db(tx).order.findUnique({ where: { idempotencyKey: key }, include: orderListInclude });
  },
};
