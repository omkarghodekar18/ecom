// OpenAPI registration for the admin module (dashboard, orders, users,
// companies, audit, settings). Domain modules (catalog, products, brands,
// attributes, cms) register their own /admin routes.
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });
const statusSchema = z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']);
const guarded = {
  '401': { description: 'Authentication required' },
  '403': { description: 'Role not permitted (STAFF/ADMIN only)' },
} as const;

openApiRegistry.registerPath({
  method: 'get',
  path: '/admin/stats',
  tags: ['Admin'],
  description:
    'Dashboard KPIs: catalog counts, orders + revenue (last 30 days), pending orders, failed imports, latest 5 orders and the low-stock watchlist.',
  responses: { '200': { description: 'Stats document' }, ...guarded },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/admin/orders',
  tags: ['Admin'],
  description: 'All orders (newest first) with buyer email/name; filters: q (orderNo/po/email), status, paymentStatus.',
  responses: { '200': { description: 'Paginated order list' }, ...guarded },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/admin/orders/export',
  tags: ['Admin'],
  description: 'CSV export (text/csv) of all orders matching the filters (max 50 000 rows).',
  responses: { '200': { description: 'CSV file' }, ...guarded },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/admin/orders/{orderNo}',
  tags: ['Admin'],
  description: 'Order detail with items, timeline and buyer identity.',
  request: { params: z.object({ orderNo: z.string() }) },
  responses: { '200': { description: 'Order detail + customer' }, '404': { description: 'ORDER_NOT_FOUND' }, ...guarded },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/admin/orders/{orderNo}',
  tags: ['Admin'],
  description:
    'Validated status transition (state machine: PENDING→CONFIRMED→PROCESSING→SHIPPED→DELIVERED; CANCELLED from the first three) and/or notes edit. Writes a timeline event + audit log.',
  request: {
    params: z.object({ orderNo: z.string() }),
    body: {
      content: { 'application/json': { schema: z.object({ status: statusSchema.optional(), notes: z.string().nullable().optional() }) } },
      required: true,
    },
  },
  responses: {
    '200': { description: 'Updated order detail' },
    '409': { description: 'Invalid transition — details list the allowed ones' },
    '404': { description: 'ORDER_NOT_FOUND' },
    ...guarded,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/admin/orders/{orderNo}/resend-email',
  tags: ['Admin'],
  description: 'Re-enqueues the order confirmation email.',
  request: { params: z.object({ orderNo: z.string() }) },
  responses: { '200': { description: 'Queued' }, '404': { description: 'ORDER_NOT_FOUND' }, ...guarded },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/admin/users',
  tags: ['Admin'],
  description: 'User list with company names (ADMIN only); filters: q, role.',
  responses: { '200': { description: 'Paginated user list' }, ...guarded },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/admin/users/{id}',
  tags: ['Admin'],
  description:
    'Activate/deactivate and role assignment (ADMIN only). Self-guarded: you cannot deactivate or demote your own account.',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({ isActive: z.boolean().optional(), role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']).optional() }),
        },
      },
      required: true,
    },
  },
  responses: { '200': { description: 'Updated' }, '404': { description: 'User not found' }, '409': { description: 'Self-guard violation' }, ...guarded },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/admin/companies',
  tags: ['Admin'],
  description: 'Company list with user + customer-price counts (ADMIN only).',
  responses: { '200': { description: 'Company list' }, ...guarded },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/admin/companies/{id}',
  tags: ['Admin'],
  description: 'Edit company name / GSTIN / customer number (ADMIN only, audited).',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({ name: z.string().optional(), gstin: z.string().optional(), customerNumber: z.string().optional() }),
        },
      },
      required: true,
    },
  },
  responses: { '200': { description: 'Updated' }, '404': { description: 'Company not found' }, ...guarded },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/admin/audit-logs',
  tags: ['Admin'],
  description: 'Audit trail viewer (ADMIN only): newest first, filter by entity or free text.',
  responses: { '200': { description: 'Paginated audit entries' }, ...guarded },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/admin/settings',
  tags: ['Admin'],
  description: 'The full settings document (tax, shipping, stock policy, feature flags) — ADMIN only.',
  responses: { '200': { description: 'Settings' }, ...guarded },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/admin/settings',
  tags: ['Admin'],
  description:
    'Partial settings update validated per key (ADMIN only, audited). tax.ratePercent, shipping.{flatRateInr,freeThresholdInr,note,expressRateInr?}, stock.policy, features.razorpayCheckout.',
  request: {
    body: { content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } }, required: true },
  },
  responses: { '200': { description: 'Updated settings' }, '400': { description: 'Validation failed' }, ...guarded },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/auth/session',
  tags: ['Auth'],
  description:
    'Read-only session lookup from the httpOnly refresh cookie (no rotation) — used by server-side guards such as the admin layout.',
  responses: {
    '200': { description: 'Active session user', content: { 'application/json': { schema: envelope(z.object({ user: z.unknown() })) } } },
    '401': { description: 'No active session' },
  },
});
