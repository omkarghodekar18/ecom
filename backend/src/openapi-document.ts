// Builds the OpenAPI document from the shared registry.
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { openApiRegistry } from './openapi.js';
import { getEnv } from './config/env.js';

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(openApiRegistry.definitions);
  const env = getEnv();
  return generator.generateDocument({
    openapi: '3.0.3',
    servers: [{ url: `${env.PUBLIC_API_URL}/api/v1`, description: 'current' }],
    info: {
      version: '1.0.0',
      title: 'ToolHub India API',
      description:
        'B2B industrial tools eShop REST API. All responses use the envelope ' +
        '`{ success, data, meta?, error? }`; errors carry `{ code, message, details? }` with stable codes.',
    },
    tags: [
      { name: 'Health', description: 'Liveness/readiness' },
      { name: 'Auth', description: 'Registration, OTP, sessions' },
      { name: 'Catalog', description: 'Categories, navigation' },
      { name: 'Products', description: 'Product families, variants, listings' },
      { name: 'Search', description: 'Full-text search and suggestions' },
      { name: 'Cart', description: 'Guest and logged-in carts' },
      { name: 'Checkout', description: 'Order placement' },
      { name: 'Orders', description: 'Order history' },
      { name: 'CMS', description: 'Banners and content pages' },
      { name: 'Admin', description: 'Back-office APIs' },
      { name: 'Import', description: 'Bulk import automation' },
    ],
  });
}
