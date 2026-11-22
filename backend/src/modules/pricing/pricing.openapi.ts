// OpenAPI registration for the pricing module.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import { ResolvedPriceDtoSchema } from '../../shared/dto/product.dto.js';
import { ResolvePricesInputSchema } from './pricing.service.js';

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });

const jsonBody = (schema: z.ZodType) => ({ content: { 'application/json': { schema } }, required: true });

const jsonResponse = (description: string, schema?: z.ZodType) => ({
  description,
  ...(schema ? { content: { 'application/json': { schema } } } : {}),
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/pricing/resolve',
  tags: ['Products'],
  description:
    'Effective unit prices for 1–100 variant lines. Ladder: the caller company\u2019s ' +
    'customer price (validity window including now) > the tier with the highest ' +
    'minQty \u2264 quantity > the variant\u2019s list price. Authentication is OPTIONAL \u2014 ' +
    'guests resolve list/tier prices; a presented-but-invalid bearer still fails 401. ' +
    'Unknown or inactive variantIds \u2192 404 with details.',
  request: { body: jsonBody(ResolvePricesInputSchema) },
  responses: {
    '200': jsonResponse(
      'Resolved prices — one entry per line, order preserved',
      envelope(z.array(ResolvedPriceDtoSchema)),
    ),
    '400': jsonResponse('Validation failed (1\u2013100 lines, integer quantities 1\u2013100 000)'),
    '401': jsonResponse('Presented bearer invalid/expired (TOKEN_INVALID / TOKEN_EXPIRED)'),
    '404': jsonResponse('Unknown or invisible variantId(s) — details { variantIds }'),
  },
});
