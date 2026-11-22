// Cart repository — the only layer touching Prisma in the cart module.
// Carts are resolved by userId (signed-in) or by the SHA-256 hash of the
// anonymous cookie token (guest, spec Section 11); rows carry a 60-day expiry.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { Transaction } from '../../db/transaction-types.js';

/** Everything the cart service needs per item: variant scalars + ordered tiers,
 * product/brand identity, attributes and the first usable image. */
export const cartItemInclude = {
  variant: {
    include: {
      priceTiers: { orderBy: { minQty: 'asc' } },
      attributes: { include: { attribute: true } },
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          deletedAt: true,
          brand: { select: { name: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        },
      },
    },
  },
} satisfies Prisma.CartItemInclude;

export type CartItemRow = Prisma.CartItemGetPayload<{ include: typeof cartItemInclude }>;

function db(tx?: Transaction): Transaction {
  return tx ?? prisma;
}

export interface CreateCartArgs {
  userId?: string | null;
  anonymousToken?: string | null; // already hashed by the caller
  expiresAt?: Date | null;
}

export const cartRepository = {
  /** The signed-in user's cart (newest if several — merge prevents that state). */
  findCartByUserId(userId: string, tx?: Transaction) {
    return db(tx).cart.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  },

  /** The guest cart for a hashed anonymous token. */
  findCartByTokenHash(tokenHash: string, tx?: Transaction) {
    return db(tx).cart.findUnique({ where: { anonymousToken: tokenHash } });
  },

  createCart(args: CreateCartArgs, tx?: Transaction) {
    return db(tx).cart.create({ data: args });
  },

  /** Full items (variant, tiers, attributes, images) for one cart. CartItem has
   * no timestamps (spec schema), so rows arrive in storage order. */
  findItems(cartId: string, tx?: Transaction): Promise<CartItemRow[]> {
    return db(tx).cartItem.findMany({
      where: { cartId },
      include: cartItemInclude,
    });
  },

  /** One item scoped by cartId — callers use this for IDOR-safe PATCH/DELETE. */
  findItemInCart(cartId: string, itemId: string, tx?: Transaction) {
    return db(tx).cartItem.findFirst({ where: { id: itemId, cartId }, include: cartItemInclude });
  },

  /** Existing item for a variant within a cart (the (cartId, variantId) unique pair). */
  findItemByVariant(cartId: string, variantId: string, tx?: Transaction) {
    return db(tx).cartItem.findFirst({ where: { cartId, variantId } });
  },

  createItem(
    args: { cartId: string; variantId: string; quantity: number; note?: string | null },
    tx?: Transaction,
  ) {
    return db(tx).cartItem.create({ data: args });
  },

  updateItem(itemId: string, data: { quantity?: number; note?: string | null }, tx?: Transaction) {
    return db(tx).cartItem.update({ where: { id: itemId }, data });
  },

  /**
   * Upsert-style bump for "add to cart" on a variant already present: the
   * unique (cartId, variantId) pair makes the conditional update race-free.
   */
  setItemQuantity(cartId: string, variantId: string, quantity: number, tx?: Transaction) {
    return db(tx).cartItem.update({
      where: { cartId_variantId: { cartId, variantId } },
      data: { quantity },
    });
  },

  deleteItem(itemId: string, tx?: Transaction) {
    return db(tx).cartItem.delete({ where: { id: itemId } });
  },

  deleteItemsByCartId(cartId: string, tx?: Transaction) {
    return db(tx).cartItem.deleteMany({ where: { cartId } });
  },

  deleteCart(cartId: string, tx?: Transaction) {
    return db(tx).cart.delete({ where: { id: cartId } });
  },

  /** Touches updatedAt + expiry so idle carts expire measurably. */
  touchCart(cartId: string, expiresAt: Date, tx?: Transaction) {
    return db(tx).cart.update({ where: { id: cartId }, data: { expiresAt } });
  },

  /** Periodic cleanup hook (jobs): carts whose expiry passed with no activity. */
  deleteExpiredCarts(olderThan: Date, tx?: Transaction) {
    return db(tx).cart.deleteMany({ where: { expiresAt: { lt: olderThan } } });
  },
};
