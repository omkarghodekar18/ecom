// OpenAPI registration for the companies module.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import { CompanyDtoSchema } from '../../shared/dto/company.dto.js';

openApiRegistry.registerPath({
  method: 'get',
  path: '/companies/me',
  tags: ['Users'],
  description: 'The B2B company linked to the caller, with its user list.',
  responses: {
    '200': {
      description: 'Company details',
      content: { 'application/json': { schema: z.object({ success: z.literal(true), data: CompanyDtoSchema }) } },
    },
    '401': { description: 'Not authenticated' },
    '404': { description: 'No company linked to this account (NOT_FOUND)' },
  },
});
