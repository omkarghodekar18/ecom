// Checkout queue name + the order-confirmation email sender. Worker
// registration lives in checkout.worker.ts (side-effect import).
import { sendMail } from '../../services/mail/index.js';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../config/logger.js';

/** pg-boss queue name for order-confirmation emails. */
export const ORDER_CONFIRMATION_QUEUE = 'order.confirmation';

/**
 * Sends the confirmation email for one placed order. Loads order + items +
 * user fresh so the email reflects the committed state. Best-effort: a mail
 * failure logs and lets pg-boss retry (it never rolls the order back).
 */
export async function sendOrderConfirmation(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, user: { select: { email: true, firstName: true } } },
  });
  if (order === null) {
    logger.warn({ orderId }, 'order.confirmation: order not found (deleted?)');
    return;
  }
  await sendMail(order.user.email, 'order-confirmation', {
    orderNo: order.orderNo,
    customerName: order.user.firstName,
    items: order.items.map((item) => ({
      name: item.name,
      articleNo: item.articleNo,
      quantity: item.quantity,
      lineTotal: item.lineTotal.toFixed(2),
    })),
    subtotal: order.subtotal.toFixed(2),
    taxTotal: order.taxTotal.toFixed(2),
    shippingTotal: order.shippingTotal.toFixed(2),
    grandTotal: order.grandTotal.toFixed(2),
    deliveryMethod: order.shippingTotal.equals(0) ? 'Standard delivery' : 'Delivery',
    paymentMethod: order.paymentMethod,
    poNumber: order.poNumber,
  });
  logger.info({ orderNo: order.orderNo }, 'order confirmation email sent');
}
