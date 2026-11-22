// OpenAPI registration for the addresses module.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import { AddressDtoSchema, AddressInputSchema } from '../../shared/dto/address.dto.js';

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });

const jsonBody = (schema: z.ZodType) => ({ content: { 'application/json': { schema } }, required: true });

const jsonResponse = (description: string, schema?: z.ZodType) => ({
  description,
  ...(schema ? { content: { 'application/json': { schema } } } : {}),
});

const listSchema = envelope(z.array(AddressDtoSchema));
const unauthorized = jsonResponse('Not authenticated');
const notFound = jsonResponse('Address not found (NOT_FOUND) — also when the address belongs to another user');

openApiRegistry.registerPath({
  method: 'get',
  path: '/addresses',
  tags: ['Users'],
  description: 'Lists the caller’s address book.',
  responses: { '200': jsonResponse('Addresses', listSchema), '401': unauthorized },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/addresses',
  tags: ['Users'],
  description:
    'Creates an address. Setting isDefaultShipping / isDefaultBilling unsets the previous default of that kind.',
  request: { body: jsonBody(AddressInputSchema) },
  responses: {
    '201': jsonResponse('Created address', envelope(AddressDtoSchema)),
    '400': jsonResponse('Validation failed'),
    '401': unauthorized,
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/addresses/{id}',
  tags: ['Users'],
  description: 'Partially updates one of the caller’s addresses.',
  request: {
    params: z.object({ id: z.string() }),
    body: jsonBody(AddressInputSchema.partial()),
  },
  responses: {
    '200': jsonResponse('Updated address', envelope(AddressDtoSchema)),
    '400': jsonResponse('Validation failed'),
    '401': unauthorized,
    '404': notFound,
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/addresses/{id}',
  tags: ['Users'],
  description: 'Deletes one of the caller’s addresses.',
  request: { params: z.object({ id: z.string() }) },
  responses: { '204': jsonResponse('Deleted'), '401': unauthorized, '404': notFound },
});
