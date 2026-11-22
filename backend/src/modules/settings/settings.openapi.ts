// OpenAPI registration for the settings module.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import { CommerceSettingsDtoSchema } from './settings.service.js';

openApiRegistry.registerPath({
  method: 'get',
  path: '/settings/commerce',
  tags: ['Settings'],
  description:
    'Storefront-facing commerce settings: tax rate, standard/express delivery rates ' +
    'and which payment methods the checkout may offer (RAZORPAY follows the feature flag).',
  responses: {
    '200': {
      description: 'Commerce settings',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true), data: CommerceSettingsDtoSchema }),
        },
      },
    },
  },
});
