// OpenAPI registration for the checkout module.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import {
  CheckoutValidateInputSchema,
  CheckoutValidateResultSchema,
  OrderDetailDtoSchema,
  PlaceOrderInputSchema,
} from '../../shared/dto/order.dto.js';

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });
const jsonBody = (schema: z.ZodType) => ({ content: { 'application/json': { schema } }, required: true });

openApiRegistry.registerPath({
  method: 'post',
  path: '/checkout/validate',
  tags: ['Checkout'],
  description:
    'Pre-flight checkout check: cart non-empty, all items buyable, stock policy satisfied, ' +
    'delivery method offered. Returns issues with stable codes plus a totals preview.',
  request: { body: jsonBody(CheckoutValidateInputSchema) },
  responses: {
    '200': { description: 'Validation result', content: { 'application/json': { schema: envelope(CheckoutValidateResultSchema) } } },
    '401': { description: 'Authentication required (checkout is auth-gated)' },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/checkout/place-order',
  tags: ['Checkout'],
  description:
    'Places the order in ONE transaction: re-prices every line server-side (customer price > ' +
    'tier > list), re-validates stock and min-order rules, recomputes totals, writes order + ' +
    'snapshot items + the first timeline event, decrements stock and clears the cart. The ' +
    'confirmation email is enqueued after the commit. Optional idempotencyKey replays return ' +
    'the original order. Payment methods: INVOICE, REQUEST (offline B2B) and RAZORPAY ' +
    '(behind the razorpayCheckout feature flag).',
  request: { body: jsonBody(PlaceOrderInputSchema) },
  responses: {
    '201': { description: 'Order placed', content: { 'application/json': { schema: envelope(OrderDetailDtoSchema) } } },
    '400': { description: 'CART_EMPTY / invalid input' },
    '401': { description: 'Authentication required' },
    '409': { description: 'Validation failed — details list the per-line issues (OUT_OF_STOCK, ITEM_UNAVAILABLE, ...)' },
    '502': { description: 'Payment gateway error (RAZORPAY)' },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/checkout/payments/razorpay/verify',
  tags: ['Checkout'],
  description:
    'Verifies a Razorpay checkout callback: HMAC signature over (gatewayOrderId|gatewayPaymentId), ' +
    'receipt binding to our orderNo, then marks the order PAID. Idempotent.',
  request: {
    body: jsonBody(
      z.object({
        orderNo: z.string(),
        razorpayOrderId: z.string(),
        razorpayPaymentId: z.string(),
        signature: z.string(),
      }),
    ),
  },
  responses: {
    '200': { description: 'Order detail (paymentStatus PAID)', content: { 'application/json': { schema: envelope(OrderDetailDtoSchema) } } },
    '400': { description: 'PAYMENT_FAILED — signature or binding mismatch' },
    '404': { description: 'ORDER_NOT_FOUND' },
  },
});
