import type { PrismaClient } from '@prisma/client';

/**
 * The interactive-transaction handle passed to `withTransaction` callbacks.
 * Structurally identical to PrismaClient minus lifecycle/engine-internal methods.
 */
export type Transaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extend' | '$metrics'
>;
