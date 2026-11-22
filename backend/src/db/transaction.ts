// Transaction helper (Section 9). Interactive transactions keep multi-step
// writes atomic (checkout, imports, cart merge).
import { prisma } from './prisma.js';
import type { Transaction } from './transaction-types.js';

/** Prisma interactive transaction: `await withTransaction(async (tx) => …)`. */
export function withTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return prisma.$transaction((tx) => fn(tx as unknown as Transaction), {
    timeout: 30_000,
    maxWait: 10_000,
  });
}
