// Checkout service (spec 6.7/11): server-side re-validation and atomic order
// placement. Prices, stock, min-order rules and totals are recomputed from the
// database at placement time — nothing the client sent is trusted. The whole
// placement (order + snapshot items + timeline event + stock decrement + cart
// clear) runs in ONE transaction; the confirmation email is enqueued after the
// commit.
import { Prisma } from '@prisma/client';
import { ERR } from '../../config/constants.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../db/prisma.js';
import { withTransaction } from '../../db/transaction.js';
import { settingsService } from '../../services/settings/index.js';
import { queue } from '../../services/queue/index.js';
import type {
  CheckoutIssue,
  CheckoutValidateResult,
  OrderDetailDto,
  PlaceOrderInput,
  PlaceOrderResult,
} from '../../shared/dto/order.dto.js';
import {
  cartRepository,
  computeTotals,
  isBuyable,
  shippingFor,
  type CartItemRow,
} from '../cart/index.js';
import { pricingRepository, resolveUnitPrice } from '../pricing/index.js';
import { attributesMap } from '../products/index.js';
import { toOrderDetailDto } from '../orders/index.js';
import { ordersRepository } from '../orders/index.js';
import {
  getPaymentProvider,
  fetchRazorpayReceipt,
  verifyRazorpaySignature,
} from './payment.provider.js';
import { ORDER_CONFIRMATION_QUEUE } from './checkout.queue.js';

/** One priced, validated order line (the commit plan). */
interface PricedLine {
  row: CartItemRow;
  unitPrice: Prisma.Decimal;
  basis: string;
  lineTotal: Prisma.Decimal;
}

/** Everything place-order decided — recomputed inside the commit transaction. */
interface CheckoutPlan {
  lines: PricedLine[];
  issues: CheckoutIssue[];
  subtotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  shippingTotal: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
}

/** Loads the user's cart row or throws CART_EMPTY-compatible 400. */
async function requireCart(userId: string) {
  const cart = await cartRepository.findCartByUserId(userId);
  if (cart === null) {
    throw new AppError(ERR.CART_EMPTY, 'Your cart is empty', 400);
  }
  return cart;
}

/**
 * Builds the checkout plan for the user's cart: resolves prices (customer →
 * tier → list), enforces buyability/stock, computes totals for the delivery
 * method. Pure with respect to writes; used by validate AND place-order.
 */
async function buildPlan(
  userId: string,
  input: { deliveryMethod: 'standard' | 'express' },
): Promise<{ plan: CheckoutPlan | null; issues: CheckoutIssue[] }> {
  const settings = await settingsService.getSettings();
  const cart = await cartRepository.findCartByUserId(userId);
  if (cart === null) {
    return { plan: null, issues: [{ code: ERR.CART_EMPTY, message: 'Your cart is empty' }] };
  }
  const rows = await cartRepository.findItems(cart.id);
  if (rows.length === 0) {
    return { plan: null, issues: [{ code: ERR.CART_EMPTY, message: 'Your cart is empty' }] };
  }

  const issues: CheckoutIssue[] = [];
  const buyable: CartItemRow[] = [];
  for (const row of rows) {
    if (isBuyable(row)) {
      buyable.push(row);
    } else {
      issues.push({
        code: 'ITEM_UNAVAILABLE',
        message: `Article ${row.variant.articleNo} is no longer available and must be removed.`,
        variantId: row.variant.id,
      });
    }
  }
  if (buyable.length === 0) {
    return { plan: null, issues };
  }

  // Delivery method availability.
  if (input.deliveryMethod === 'express' && settings.shipping.expressRateInr === undefined) {
    issues.push({ code: 'DELIVERY_METHOD_UNAVAILABLE', message: 'Express delivery is not offered.' });
  }

  // Stock policy.
  if (settings.stock.policy === 'STOCK_ONLY') {
    for (const row of buyable) {
      if (row.variant.stockQty <= 0) {
        issues.push({
          code: ERR.OUT_OF_STOCK,
          message: `Article ${row.variant.articleNo} is not available.`,
          variantId: row.variant.id,
        });
      } else if (row.quantity > row.variant.stockQty) {
        issues.push({
          code: ERR.OUT_OF_STOCK,
          message: `Only ${row.variant.stockQty} of article ${row.variant.articleNo} in stock (requested ${row.quantity}).`,
          variantId: row.variant.id,
        });
      }
    }
  }

  // Prices.
  const variantIds = buyable.map((row) => row.variant.id);
  const companyId = await pricingRepository.findCompanyIdForUser(userId);
  const customerPrices =
    companyId !== null
      ? await pricingRepository.findCustomerPrices(companyId, variantIds)
      : new Map<string, Prisma.Decimal>();

  const lines: PricedLine[] = buyable.map((row) => {
    const { unitPrice, basis } = resolveUnitPrice(
      row.variant,
      customerPrices.get(row.variant.id) ?? null,
      row.quantity,
    );
    const price = new Prisma.Decimal(unitPrice);
    return { row, unitPrice: price, basis, lineTotal: price.mul(row.quantity) };
  });

  const subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
  const taxRatePercent = settings.tax.ratePercent;
  const taxTotal = subtotal.mul(taxRatePercent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const shippingTotal =
    issues.some((issue) => issue.code === 'DELIVERY_METHOD_UNAVAILABLE')
      ? new Prisma.Decimal(0)
      : shippingFor(input.deliveryMethod, subtotal, settings.shipping);
  const grandTotal = subtotal.plus(taxTotal).plus(shippingTotal);

  const plan: CheckoutPlan = { lines, issues, subtotal, taxTotal, shippingTotal, grandTotal };
  return { plan, issues };
}

/**
 * ORD-YYYY-NNNNNN from the per-year OrderSequence counter (atomic increment
 * inside the caller's transaction; the unique (userId, idempotencyKey)
 * constraint makes replayed requests safe).
 */
async function nextOrderNo(tx: { orderSequence: { update: typeof prisma.orderSequence.update; create: typeof prisma.orderSequence.create } }): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const row = await tx.orderSequence.update({
        where: { year },
        data: { lastNumber: { increment: 1 } },
      });
      return `ORD-${year}-${String(row.lastNumber).padStart(6, '0')}`;
    } catch (err) {
      // First order of the year: the row does not exist yet → create + retry.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        try {
          await tx.orderSequence.create({ data: { year, lastNumber: 0 } });
          continue; // retry the increment
        } catch (createErr) {
          if (createErr instanceof Prisma.PrismaClientKnownRequestError && createErr.code === 'P2002') {
            continue; // concurrent create won — retry the increment
          }
          throw createErr;
        }
      }
      throw err;
    }
  }
  throw new Error('Could not allocate an order number');
}

export const checkoutService = {
  /** POST /checkout/validate — pre-flight check used by the UI steps. */
  async validate(userId: string, input: { deliveryMethod?: 'standard' | 'express' }): Promise<CheckoutValidateResult> {
    const method = input.deliveryMethod ?? 'standard';
    const { plan, issues } = await buildPlan(userId, { deliveryMethod: method });
    return {
      ok: plan !== null && issues.length === 0,
      issues: issues.map((issue) => ({ ...issue, variantId: issue.variantId ?? null })),
      totals:
        plan !== null && issues.length === 0
          ? {
              subtotal: plan.subtotal.toFixed(2),
              taxRatePercent: (await settingsService.getSettings()).tax.ratePercent,
              taxTotal: plan.taxTotal.toFixed(2),
              shippingTotal: plan.shippingTotal.toFixed(2),
              grandTotal: plan.grandTotal.toFixed(2),
            }
          : null,
      itemCount: plan?.lines.reduce((sum, line) => sum + line.row.quantity, 0) ?? 0,
    };
  },

  /**
   * POST /checkout/place-order — the one-transaction placement (spec 6.7):
   * re-price, re-validate stock, create order + snapshots + timeline event,
   * decrement stock, clear the cart; enqueue the confirmation email after the
   * commit. `idempotencyKey` replays return the original order unchanged.
   */
  async placeOrder(userId: string, input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const settings = await settingsService.getSettings();

    // Idempotent replay: same key, same user → the original order.
    if (input.idempotencyKey !== undefined) {
      const existing = await ordersRepository.findByIdempotencyKey(input.idempotencyKey);
      if (existing !== null) {
        if (existing.userId !== userId) {
          throw new AppError(ERR.CONFLICT, 'Idempotency key already used', 409);
        }
        const detail = await ordersRepository.findOrderByOrderNo(existing.orderNo, { userId });
        if (detail !== null) return { ...toOrderDetailDto(detail), payment: { gatewayRef: null } };
      }
    }

    // Gate the payment method before any work (RAZORPAY behind the feature flag).
    getPaymentProvider(input.paymentMethod, settings.features.razorpayCheckout);

    const { plan, issues } = await buildPlan(userId, { deliveryMethod: input.deliveryMethod });
    if (plan === null) {
      const first = issues[0];
      if (first?.code === ERR.CART_EMPTY) {
        throw new AppError(ERR.CART_EMPTY, first.message, 400);
      }
      throw new AppError(ERR.VALIDATION_ERROR, 'Checkout validation failed', 409, issues);
    }
    if (issues.length > 0) {
      throw new AppError(ERR.VALIDATION_ERROR, 'Checkout validation failed', 409, issues);
    }
    const cart = await requireCart(userId);

    const created = await withTransaction(async (tx) => {
      // Fresh read inside the transaction: prices/stock may have moved since
      // buildPlan — the authoritative pass runs here.
      const rows = await cartRepository.findItems(cart.id, tx);
      if (rows.length === 0) {
        throw new AppError(ERR.CART_EMPTY, 'Your cart is empty', 400);
      }
      const variantIds = rows.filter(isBuyable).map((row) => row.variant.id);
      const companyId = await pricingRepository.findCompanyIdForUser(userId, tx);
      const customerPrices =
        companyId !== null
          ? await pricingRepository.findCustomerPrices(companyId, variantIds, tx)
          : new Map<string, Prisma.Decimal>();

      const lines: PricedLine[] = [];
      const txIssues: CheckoutIssue[] = [];
      for (const row of rows) {
        if (!isBuyable(row)) {
          txIssues.push({
            code: 'ITEM_UNAVAILABLE',
            message: `Article ${row.variant.articleNo} is no longer available.`,
            variantId: row.variant.id,
          });
          continue;
        }
        if (settings.stock.policy === 'STOCK_ONLY' && row.quantity > row.variant.stockQty) {
          txIssues.push({
            code: ERR.OUT_OF_STOCK,
            message: `Only ${row.variant.stockQty} of article ${row.variant.articleNo} in stock.`,
            variantId: row.variant.id,
          });
          continue;
        }
        const { unitPrice, basis } = resolveUnitPrice(
          row.variant,
          customerPrices.get(row.variant.id) ?? null,
          row.quantity,
        );
        const price = new Prisma.Decimal(unitPrice);
        lines.push({ row, unitPrice: price, basis, lineTotal: price.mul(row.quantity) });
      }
      if (txIssues.length > 0 || lines.length === 0) {
        throw new AppError(ERR.VALIDATION_ERROR, 'Checkout validation failed', 409, txIssues);
      }

      const subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
      const taxTotal = subtotal
        .mul(settings.tax.ratePercent)
        .div(100)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const shippingTotal = shippingFor(input.deliveryMethod, subtotal, settings.shipping);
      const grandTotal = subtotal.plus(taxTotal).plus(shippingTotal);
      const orderNo = await nextOrderNo(tx);

      const order = await tx.order.create({
        data: {
          orderNo,
          userId,
          status: 'PENDING',
          paymentStatus: input.paymentMethod === 'RAZORPAY' ? 'UNPAID' : 'UNPAID',
          paymentMethod: input.paymentMethod,
          shippingAddress: input.shippingAddress as unknown as Prisma.InputJsonValue,
          billingAddress: (input.billingAddress ?? input.shippingAddress) as unknown as Prisma.InputJsonValue,
          poNumber: input.poNumber ?? null,
          notes: input.notes ?? null,
          subtotal,
          taxTotal,
          shippingTotal,
          grandTotal,
          currency: 'INR',
          idempotencyKey: input.idempotencyKey ?? null,
          items: {
            create: lines.map((line) => ({
              variantId: line.row.variant.id,
              articleNo: line.row.variant.articleNo,
              name:
                line.row.variant.name !== null && line.row.variant.name !== ''
                  ? `${line.row.variant.product.name} ${line.row.variant.name}`
                  : line.row.variant.product.name,
              attributesSnapshot: attributesMap(
                line.row.variant.attributes as unknown as Parameters<typeof attributesMap>[0],
              ) as unknown as Prisma.InputJsonValue,
              imagePublicId:
                (line.row.variant.images[0] ?? line.row.variant.product.images[0] ?? null)?.publicId ?? null,
              unitPrice: line.unitPrice,
              quantity: line.row.quantity,
              lineTotal: line.lineTotal,
            })),
          },
          events: {
            create: { status: 'PENDING', note: 'Order placed' },
          },
        },
        include: { items: true, events: { orderBy: { createdAt: 'asc' as const } } },
      });

      // Stock decrement (spec Section 11; under ALLOW_BACKORDER stock may go
      // negative — the negative value is the open backorder).
      for (const line of lines) {
        await tx.variant.update({
          where: { id: line.row.variant.id },
          data: { stockQty: { decrement: line.row.quantity } },
        });
      }

      // Clear the cart (items only — the row survives for the next session).
      await cartRepository.deleteItemsByCartId(cart.id, tx);
      return order;
    });

    // Post-commit side effects — never inside the transaction.
    await queue
      .enqueue(ORDER_CONFIRMATION_QUEUE, { orderId: created.id })
      .catch((err: unknown) => logger.error({ err }, 'failed to enqueue order confirmation'));

    let gatewayRef: string | null = null;
    if (input.paymentMethod === 'RAZORPAY') {
      try {
        const provider = getPaymentProvider('RAZORPAY', true);
        const authorization = await provider.authorize({
          orderNo: created.orderNo,
          amountMinor: Number(created.grandTotal.mul(100).toFixed(0)),
          currency: created.currency,
          email: '',
        });
        gatewayRef = authorization.gatewayRef;
      } catch (err) {
        // The order stands (PENDING/UNPAID); the gateway failure is recorded.
        logger.error({ err, orderNo: created.orderNo }, 'razorpay authorize failed after order creation');
        await prisma.orderEvent.create({
          data: { orderId: created.id, status: 'PENDING', note: 'Payment gateway error — retry required' },
        });
      }
    }

    const detail = await ordersRepository.findOrderByOrderNo(created.orderNo, { userId });
    if (detail === null) {
      throw new Error('Order disappeared after placement');
    }
    return { ...toOrderDetailDto(detail), payment: { gatewayRef } };
  },

  /**
   * POST /checkout/payments/razorpay/verify — checkout callback: verifies the
   * signature, binds the gateway order to our orderNo via the receipt, marks
   * the order PAID and appends a timeline event.
   */
  async verifyRazorpay(
    userId: string,
    input: { orderNo: string; razorpayOrderId: string; razorpayPaymentId: string; signature: string },
  ): Promise<OrderDetailDto> {
    const order = await ordersRepository.findOrderByOrderNo(input.orderNo, { userId });
    if (order === null) throw new AppError(ERR.ORDER_NOT_FOUND, 'Order not found', 404);
    if (order.paymentMethod !== 'RAZORPAY') {
      throw new AppError(ERR.VALIDATION_ERROR, 'Order is not an online-payment order', 400);
    }
    if (order.paymentStatus === 'PAID') return toOrderDetailDto(order); // idempotent

    if (!verifyRazorpaySignature(input.razorpayOrderId, input.razorpayPaymentId, input.signature)) {
      throw new AppError(ERR.PAYMENT_FAILED, 'Payment signature verification failed', 400);
    }
    const receipt = await fetchRazorpayReceipt(input.razorpayOrderId);
    if (receipt !== order.orderNo) {
      throw new AppError(ERR.PAYMENT_FAILED, 'Payment does not belong to this order', 400);
    }

    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } }),
      prisma.orderEvent.create({
        data: { orderId: order.id, status: order.status, note: 'Payment received (online)' },
      }),
    ]);
    const updated = await ordersRepository.findOrderByOrderNo(input.orderNo, { userId });
    if (updated === null) throw new Error('Order disappeared');
    return toOrderDetailDto(updated);
  },

  /** Exported for the OpenAPI docs + tests: totals as the cart sees them. */
  computeTotals,
};
