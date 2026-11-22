// OpenAPI registration for the cart module.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import {
  AddCartItemSchema,
  CartDtoSchema,
  CartImportResultSchema,
  CartImportSchema,
  UpdateCartItemSchema,
} from '../../shared/dto/cart.dto.js';

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });
const jsonBody = (schema: z.ZodType) => ({ content: { 'application/json': { schema } }, required: true });
const jsonResponse = (description: string, schema?: z.ZodType) => ({
  description,
  ...(schema ? { content: { 'application/json': { schema } } } : {}),
});

const cartResponses = {
  '200': jsonResponse('The caller\u2019s cart (guest via th_cart cookie, user via bearer)', envelope(CartDtoSchema)),
  '401': jsonResponse('Presented bearer invalid/expired (TOKEN_INVALID / TOKEN_EXPIRED)'),
  '409': jsonResponse('Quantity rules rejected the line (OUT_OF_STOCK under STOCK_ONLY policy)'),
} as const;

openApiRegistry.registerPath({
  method: 'get',
  path: '/cart',
  tags: ['Cart'],
  description:
    'The caller\u2019s cart with server-computed prices (customer price > tier > list), ' +
    'totals (tax from settings, standard shipping estimate) and warnings. Never creates a row.',
  responses: cartResponses,
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/cart/items',
  tags: ['Cart'],
  description:
    'Add a variant (or increase its line). Quantities are normalised onto the variant\u2019s ' +
    'minOrderQty/packSize grid and the stock policy; adjustments come back as cart warnings. ' +
    'First guest add sets the httpOnly th_cart cookie (60 days).',
  request: { body: jsonBody(AddCartItemSchema) },
  responses: { ...cartResponses, '201': cartResponses['200'], '404': jsonResponse('Unknown/inactive variantId') },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/cart/items/{id}',
  tags: ['Cart'],
  description: 'Change quantity and/or note of one cart item (scoped to the caller\u2019s cart).',
  request: { params: z.object({ id: z.string() }), body: jsonBody(UpdateCartItemSchema) },
  responses: { ...cartResponses, '404': jsonResponse('Item not in the caller\u2019s cart') },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/cart/items/{id}',
  tags: ['Cart'],
  description: 'Remove one line from the caller\u2019s cart.',
  request: { params: z.object({ id: z.string() }) },
  responses: { ...cartResponses, '404': jsonResponse('Item not in the caller\u2019s cart') },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/cart/merge',
  tags: ['Cart'],
  description:
    'After login: merge the guest cart (th_cart cookie) into the user cart. Identical ' +
    'variants sum quantities under the rules; the guest cart is deleted and the cookie cleared. ' +
    'Called automatically by the frontend on every successful sign-in.',
  responses: {
    '200': jsonResponse('The merged user cart', envelope(CartDtoSchema)),
    '401': jsonResponse('Authentication required'),
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/cart/import-csv',
  tags: ['Cart'],
  description:
    'Quick-order style import: up to 200 { articleNo, quantity } lines. Unknown articles are ' +
    'reported per line; every valid line is added in one transaction. Article numbers accept ' +
    'comma or dot decimals ("111100 0,5" / "111100 0.5").',
  request: { body: jsonBody(CartImportSchema) },
  responses: {
    '200': jsonResponse(
      'Cart plus per-line results',
      envelope(z.object({ cart: CartDtoSchema, results: z.array(CartImportResultSchema) })),
    ),
    '400': jsonResponse('Validation failed (1\u2013200 lines)'),
  },
});
