// Registers the order-confirmation worker (import = side effect, same pattern
// as catalog.worker).
import { logger } from '../../config/logger.js';
import { queue } from '../../services/queue/index.js';
import { ORDER_CONFIRMATION_QUEUE, sendOrderConfirmation } from './checkout.queue.js';

queue
  .work<{ orderId: string }>(ORDER_CONFIRMATION_QUEUE, async (data) => {
    await sendOrderConfirmation(data.orderId);
  })
  .catch((err: unknown) => {
    logger.error({ err }, 'failed to register order.confirmation worker');
  });
