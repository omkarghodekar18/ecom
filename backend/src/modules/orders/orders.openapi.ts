// OpenAPI registration for the orders module.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import {
  OrderDetailDtoSchema,
  OrderListItemDtoSchema,
} from '../../shared/dto/order.dto.js';
import { CartDtoSchema } from '../../shared/dto/cart.dto.js';
import { ListOrdersQuerySchema } from './orders.service.js';

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });

openApiRegistry.registerPath({
  method: 'get',
  path: '/orders',
  tags: ['Orders'],
  description:
    'The caller\u2019s orders, newest first, with item counts. Paginated (?page&pageSize, max 100).',
  request: { query: ListOrdersQuerySchema },
  responses: {
    '200': {
      description: 'Order list',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true), data: z.array(OrderListItemDtoSchema) }),
        },
      },
    },
    '401': { description: 'Authentication required' },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/orders/{orderNo}',
  tags: ['Orders'],
  description:
    'Order detail with line snapshots and the status timeline (OrderEvent rows). ' +
    'Scoped to the caller — other users\u2019 order numbers return ORDER_NOT_FOUND.',
  request: { params: z.object({ orderNo: z.string() }) },
  responses: {
    '200': { description: 'Order detail', content: { 'application/json': { schema: envelope(OrderDetailDtoSchema) } } },
    '401': { description: 'Authentication required' },
    '404': { description: 'ORDER_NOT_FOUND' },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/orders/{orderNo}/reorder',
  tags: ['Orders'],
  description:
    'Puts every line of a past order back into the cart at current prices under the ' +
    'current quantity rules (unknown articles are skipped with a cart warning).',
  request: { params: z.object({ orderNo: z.string() }) },
  responses: {
    '200': { description: 'The updated cart', content: { 'application/json': { schema: envelope(CartDtoSchema) } } },
    '401': { description: 'Authentication required' },
    '404': { description: 'ORDER_NOT_FOUND' },
  },
});
