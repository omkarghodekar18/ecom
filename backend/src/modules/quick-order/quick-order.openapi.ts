// OpenAPI registration for the quick-order module.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import { QuickOrderLineResultSchema, QuickOrderValidateSchema } from '../../shared/dto/order.dto.js';

openApiRegistry.registerPath({
  method: 'post',
  path: '/quick-order/validate',
  tags: ['Quick order'],
  description:
    'Resolves up to 200 article-number lines (articleNo + quantity) against the live catalog: ' +
    'variant identity, image, list price, min-order/pack rules and the stock policy. Unknown ' +
    'articles are reported per line. Article numbers accept comma or dot decimals.',
  request: {
    body: { content: { 'application/json': { schema: QuickOrderValidateSchema } }, required: true },
  },
  responses: {
    '200': {
      description: 'Per-line results, order preserved',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true), data: z.array(QuickOrderLineResultSchema) }),
        },
      },
    },
    '400': { description: 'Validation failed (1\u2013200 lines)' },
  },
});
