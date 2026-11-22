// Cart service (spec Section 11): server-side cart for guests (hashed cookie
// token) and signed-in users. ALL pricing happens here — customer price →
// quantity tier → list — never trusting client prices. Quantity adjustments
// (minOrderQty, packSize, stock policy) come back as warnings on the cart DTO.
import { Prisma } from '@prisma/client';
import { ERR } from '../../config/constants.js';
import { hmacHash, randomToken } from '../../common/utils/crypto.util.js';
import { AppError } from '../../common/errors/app-error.js';
import { articleNoCandidates } from '../../common/utils/article-no.util.js';
import { withTransaction } from '../../db/transaction.js';
import { settingsService } from '../../services/settings/index.js';
import { pricingRepository, resolveUnitPrice, type PriceBasis } from '../pricing/index.js';
import type {
  AddCartItemInput,
  CartDto,
  CartImportInput,
  CartImportResult,
  CartWarningDto,
  UpdateCartItemInput,
} from '../../shared/dto/cart.dto.js';
import { cartRepository, type CartItemRow } from './cart.repository.js';
import { isBuyable, toCartItemDto } from './cart.mapper.js';
import { applyQuantityRules, computeTotals, QuantityRuleError, stockWarnings } from './cart.rules.js';

/** 60-day guest cart cookie/row lifetime (spec Section 11). */
export const CART_TTL_MS = 60 * 24 * 60 * 60 * 1000;

/** Anonymous cookie token → the value stored in Cart.anonymousToken. */
export function hashCartToken(token: string): string {
  return hmacHash(`cart:${token}`);
}

/** Who is calling: a verified user, a guest cookie, both (merge) or neither. */
export interface CartActor {
  userId: string | null;
  guestToken: string | null;
}

/** Result of a mutating cart flow: the DTO plus cookie side-effects. */
export interface CartMutationResult {
  cart: CartDto;
  /** Raw token the controller must set as the th_cart cookie (guest cart created). */
  setGuestCookie?: string;
  /** True when the guest cart was consumed (merge) — controller clears the cookie. */
  clearGuestCookie?: boolean;
}

// ── internal helpers ──────────────────────────────────────────────────────────

function emptyCartDto(): CartDto {
  return {
    id: null,
    currency: 'INR',
    itemCount: 0,
    items: [],
    totals: {
      subtotal: '0.00',
      taxRatePercent: 0,
      taxTotal: '0.00',
      shippingTotal: '0.00',
      grandTotal: '0.00',
      currency: 'INR',
      freeShippingThreshold: null,
      shippingNote: 'Calculated at checkout',
    },
    warnings: [],
  };
}

/** Loads the actor's cart row (user cart wins when both exist pre-merge). */
async function findActorCart(actor: CartActor) {
  if (actor.userId !== null) {
    const cart = await cartRepository.findCartByUserId(actor.userId);
    if (cart !== null) return cart;
  }
  if (actor.guestToken !== null) {
    return cartRepository.findCartByTokenHash(hashCartToken(actor.guestToken));
  }
  return null;
}

/** All priced items of a cart: filters non-buyable rows (with a warning each). */
async function pricedItems(
  rows: CartItemRow[],
  userId: string | null,
): Promise<{ items: ReturnType<typeof toCartItemDto>[]; warnings: CartWarningDto[] }> {
  const warnings: CartWarningDto[] = [];
  const buyable = rows.filter((row) => {
    if (isBuyable(row)) return true;
    warnings.push({
      code: 'ITEM_UNAVAILABLE',
      message: `Article ${row.variant.articleNo} is currently not available and is not priced.`,
      variantId: row.variant.id,
    });
    return false;
  });

  const variantIds = buyable.map((row) => row.variant.id);
  const companyId =
    userId !== null && variantIds.length > 0
      ? await pricingRepository.findCompanyIdForUser(userId)
      : null;
  const customerPrices =
    companyId !== null
      ? await pricingRepository.findCustomerPrices(companyId, variantIds)
      : new Map<string, Prisma.Decimal>();

  const items = buyable.map((row) => {
    const { unitPrice, basis } = resolveUnitPrice(
      row.variant,
      customerPrices.get(row.variant.id) ?? null,
      row.quantity,
    );
    return { dto: toCartItemDto(row, new Prisma.Decimal(unitPrice), basis as PriceBasis), basis };
  });
  return {
    items: items.map((i) => i.dto),
    warnings,
  };
}

/** Rows + actor → full CartDto (totals, stock warnings). */
async function buildCartDto(cartId: string | null, userId: string | null): Promise<CartDto> {
  if (cartId === null) return emptyCartDto();
  const rows = await cartRepository.findItems(cartId);
  const { items, warnings } = await pricedItems(rows, userId);
  const settings = await settingsService.getSettings();
  const totals = computeTotals(
    items.map((item) => ({ unitPrice: item.unitPrice, quantity: item.quantity })),
    settings,
  );
  const stock = stockWarnings(
    items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
      stockQty: item.availability.stockQty,
      articleNo: item.articleNo,
    })),
  );
  return {
    id: cartId,
    currency: totals.currency,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    items,
    totals,
    warnings: [...warnings, ...stock],
  };
}

/** Loads one buyable variant or throws 404 (unknown/inactive/draft). */
async function requireBuyableVariant(variantId: string) {
  const variants = await pricingRepository.findVariantsByIds([variantId]);
  const variant = variants[0];
  if (variant === undefined) {
    throw new AppError(ERR.NOT_FOUND, 'Variant not found', 404, { variantIds: [variantId] });
  }
  return variant;
}

function mapQuantityRuleError(err: unknown): never {
  if (err instanceof QuantityRuleError) {
    throw new AppError(err.code === 'OUT_OF_STOCK' ? ERR.OUT_OF_STOCK : ERR.VALIDATION_ERROR, err.message, 409, err.details);
  }
  throw err;
}

// ── public flows ──────────────────────────────────────────────────────────────

export const cartService = {
  /** GET /cart — the actor's cart (never creates a row). */
  async getCart(actor: CartActor): Promise<CartDto> {
    const cart = await findActorCart(actor);
    return buildCartDto(cart?.id ?? null, actor.userId);
  },

  /** POST /cart/items — add/increase a line under quantity rules. */
  async addItem(actor: CartActor, input: AddCartItemInput): Promise<CartMutationResult> {
    const settings = await settingsService.getSettings();
    const variant = await requireBuyableVariant(input.variantId);
    let cart = await findActorCart(actor);
    let setGuestCookie: string | undefined;

    if (cart === null) {
      // First add: create the row. Guests get a fresh cookie token.
      const token = actor.guestToken ?? randomToken(24);
      cart = await cartRepository.createCart({
        userId: actor.userId,
        anonymousToken: actor.userId === null ? hashCartToken(token) : null,
        expiresAt: new Date(Date.now() + CART_TTL_MS),
      });
      if (actor.userId === null) setGuestCookie = token;
    }

    const existing = await cartRepository.findItemByVariant(cart.id, variant.id);
    const target = (existing?.quantity ?? 0) + input.quantity;
    let applied: { quantity: number; warnings: CartWarningDto[] };
    try {
      applied = applyQuantityRules(target, variant, settings.stock.policy);
    } catch (err) {
      mapQuantityRuleError(err);
    }
    const { quantity, warnings } = applied;

    if (existing === null) {
      await cartRepository.createItem({ cartId: cart.id, variantId: variant.id, quantity, note: input.note ?? null });
    } else {
      await cartRepository.setItemQuantity(cart.id, variant.id, quantity);
      if (input.note !== undefined) {
        await cartRepository.updateItem(existing.id, { note: input.note });
      }
    }
    await cartRepository.touchCart(cart.id, new Date(Date.now() + CART_TTL_MS));

    const dto = await buildCartDto(cart.id, actor.userId);
    for (const warning of warnings) warning.variantId = variant.id;
    return { cart: { ...dto, warnings: [...warnings, ...dto.warnings] }, setGuestCookie };
  },

  /** PATCH /cart/items/:id — change quantity and/or note (IDOR-safe by cart scope). */
  async updateItem(actor: CartActor, itemId: string, input: UpdateCartItemInput): Promise<CartMutationResult> {
    const cart = await findActorCart(actor);
    if (cart === null) throw new AppError(ERR.NOT_FOUND, 'Cart item not found', 404);
    const item = await cartRepository.findItemInCart(cart.id, itemId);
    if (item === null) throw new AppError(ERR.NOT_FOUND, 'Cart item not found', 404);

    const warnings: CartWarningDto[] = [];
    if (input.quantity !== undefined) {
      const settings = await settingsService.getSettings();
      let applied: { quantity: number; warnings: CartWarningDto[] };
      try {
        applied = applyQuantityRules(input.quantity, item.variant, settings.stock.policy);
      } catch (err) {
        mapQuantityRuleError(err);
      }
      await cartRepository.updateItem(item.id, { quantity: applied.quantity });
      for (const warning of applied.warnings) warning.variantId = item.variant.id;
      warnings.push(...applied.warnings);
    }
    if (input.note !== undefined) {
      await cartRepository.updateItem(item.id, { note: input.note === '' ? null : input.note });
    }
    const dto = await buildCartDto(cart.id, actor.userId);
    return { cart: { ...dto, warnings: [...warnings, ...dto.warnings] } };
  },

  /** DELETE /cart/items/:id. */
  async removeItem(actor: CartActor, itemId: string): Promise<CartMutationResult> {
    const cart = await findActorCart(actor);
    if (cart === null) throw new AppError(ERR.NOT_FOUND, 'Cart item not found', 404);
    const item = await cartRepository.findItemInCart(cart.id, itemId);
    if (item === null) throw new AppError(ERR.NOT_FOUND, 'Cart item not found', 404);
    await cartRepository.deleteItem(itemId);
    return { cart: await buildCartDto(cart.id, actor.userId) };
  },

  /**
   * POST /cart/merge (spec 11): guest cart → user cart after login. Identical
   * variants sum quantities (rules re-applied); a line the rules reject under
   * STOCK_ONLY is skipped with a warning instead of failing the whole merge.
   */
  async mergeCarts(userId: string, guestToken: string | null): Promise<CartMutationResult> {
    const settings = await settingsService.getSettings();
    const guestCart =
      guestToken !== null ? await cartRepository.findCartByTokenHash(hashCartToken(guestToken)) : null;

    const userCart = await cartRepository.findCartByUserId(userId);
    if (guestCart === null || (userCart !== null && guestCart.id === userCart.id)) {
      return { cart: await buildCartDto(userCart?.id ?? null, userId), clearGuestCookie: guestCart !== null };
    }

    const merged = await withTransaction(async (tx) => {
      const target = userCart ?? (await cartRepository.createCart({ userId }, tx));
      const userRows = await cartRepository.findItems(target.id, tx);
      const guestRows = await cartRepository.findItems(guestCart.id, tx);

      // Sum per variant across both carts.
      const quantities = new Map<string, number>();
      for (const row of [...userRows, ...guestRows]) {
        quantities.set(row.variantId, (quantities.get(row.variantId) ?? 0) + row.quantity);
      }
      const warnings: CartWarningDto[] = [];
      const userVariantIds = new Set(userRows.map((row) => row.variantId));
      for (const [variantId, quantity] of quantities) {
        const row = [...userRows, ...guestRows].find((r) => r.variantId === variantId);
        if (row === undefined) continue;
        try {
          const applied = applyQuantityRules(quantity, row.variant, settings.stock.policy);
          if (userVariantIds.has(variantId)) {
            await cartRepository.setItemQuantity(target.id, variantId, applied.quantity, tx);
          } else {
            await cartRepository.createItem(
              { cartId: target.id, variantId, quantity: applied.quantity, note: row.note },
              tx,
            );
          }
          for (const warning of applied.warnings) warning.variantId = variantId;
          warnings.push(...applied.warnings);
        } catch (err) {
          if (err instanceof QuantityRuleError && err.code === 'OUT_OF_STOCK') {
            warnings.push({
              code: 'OUT_OF_STOCK',
              message: `Article ${row.variant.articleNo} could not be merged — not available.`,
              variantId,
            });
            continue;
          }
          throw err;
        }
      }
      await cartRepository.deleteCart(guestCart.id, tx);
      return { cartId: target.id, warnings };
    });

    const dto = await buildCartDto(merged.cartId, userId);
    return {
      cart: { ...dto, warnings: [...merged.warnings, ...dto.warnings] },
      clearGuestCookie: true,
    };
  },

  /**
   * POST /cart/import-csv — quick-order style lines (articleNo + qty). Invalid
   * lines are reported per row; all valid lines land in one transaction.
   */
  async importCsv(actor: CartActor, input: CartImportInput): Promise<CartMutationResult & { results: CartImportResult[] }> {
    const settings = await settingsService.getSettings();
    const candidates = new Set<string>();
    for (const line of input.lines) {
      for (const candidate of articleNoCandidates(line.articleNo)) candidates.add(candidate);
    }
    const variants = await pricingRepository.findVariantsByArticleNos([...candidates]);
    const byArticleNo = new Map(variants.map((variant) => [variant.articleNo, variant]));

    const results: CartImportResult[] = [];
    const toAdd: Array<{ variantId: string; quantity: number; warningCodes: string[] }> = [];

    for (const line of input.lines) {
      const variant = articleNoCandidates(line.articleNo)
        .map((candidate) => byArticleNo.get(candidate))
        .find((found) => found !== undefined);
      if (variant === undefined) {
        results.push({
          articleNo: line.articleNo,
          ok: false,
          quantity: null,
          error: { code: 'ARTICLE_NOT_FOUND', message: `No article found for '${line.articleNo}'.` },
        });
        continue;
      }
      try {
        const applied = applyQuantityRules(line.quantity, variant, settings.stock.policy);
        toAdd.push({ variantId: variant.id, quantity: applied.quantity, warningCodes: applied.warnings.map((w) => w.code) });
        results.push({ articleNo: line.articleNo, ok: true, quantity: applied.quantity, error: null });
      } catch (err) {
        if (err instanceof QuantityRuleError) {
          results.push({
            articleNo: line.articleNo,
            ok: false,
            quantity: null,
            error: { code: err.code, message: err.message },
          });
          continue;
        }
        throw err;
      }
    }

    let setGuestCookie: string | undefined;
    let cartId: string | null = null;
    if (toAdd.length > 0) {
      let cart = await findActorCart(actor);
      if (cart === null) {
        const token = actor.guestToken ?? randomToken(24);
        cart = await cartRepository.createCart({
          userId: actor.userId,
          anonymousToken: actor.userId === null ? hashCartToken(token) : null,
          expiresAt: new Date(Date.now() + CART_TTL_MS),
        });
        if (actor.userId === null) setGuestCookie = token;
      }
      cartId = cart.id;
      const cartIdFinal = cart.id;
      await withTransaction(async (tx) => {
        const existingRows = await cartRepository.findItems(cartIdFinal, tx);
        const existingByVariant = new Map(existingRows.map((row) => [row.variantId, row.quantity]));
        for (const add of toAdd) {
          const base = existingByVariant.get(add.variantId) ?? 0;
          const target = base + add.quantity;
          if (existingByVariant.has(add.variantId)) {
            await cartRepository.setItemQuantity(cartIdFinal, add.variantId, target, tx);
          } else {
            await cartRepository.createItem({ cartId: cartIdFinal, variantId: add.variantId, quantity: target }, tx);
          }
        }
        await cartRepository.touchCart(cartIdFinal, new Date(Date.now() + CART_TTL_MS), tx);
      });
    }

    const dto = await buildCartDto(cartId, actor.userId);
    return { cart: dto, results, setGuestCookie };
  },
};
