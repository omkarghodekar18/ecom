// OpenAPI contract assembled with zod-to-openapi (Section 2). Modules register
// their paths against this shared registry; /api/docs serves Swagger UI.
import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const openApiRegistry = new OpenAPIRegistry();

openApiRegistry.registerComponent('schemas', 'ErrorResponse', {
  type: 'object',
  properties: {
    success: { type: 'boolean', enum: [false] },
    error: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} },
      required: ['code', 'message'],
    },
  },
  required: ['success', 'error'],
});
