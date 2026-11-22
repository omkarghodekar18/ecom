// Admin orders service (spec Section 15.6): filtered list, detail with buyer,
// CSV export and VALIDATED status transitions (state machine below) writing a
// timeline event + audit log. STAFF may manage orders; ADMIN additionally
// triggers rollbacks elsewhere (imports).
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { ERR } from '../../config/constants.js';
import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../db/prisma.js';
import { withTransaction } from '../../db/transaction.js';
import { writeAudit } from '../../services/audit/index.js';
import { queue } from '../../services/queue/index.js';
import { ORDER_CONFIRMATION_QUEUE } from '../checkout/index.js';
import { toOrderDetailDto } from '../orders/index.js';

export const OrderStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']);
export type AdminOrderStatus = z.infer<typeof OrderStatusSchema>;

/** Valid transitions (spec 15.6 "validated state machine"). */
const ALLOWED: Record<AdminOrderStatus, AdminOrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** The transitions offered for a status (empty = terminal). */
export function nextStatuses(status: AdminOrderStatus): AdminOrderStatus[] {
  return ALLOWED[status];
}

export const AdminOrdersQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: OrderStatusSchema.optional(),
  paymentStatus: z.enum(['UNPAID', 'PAID', 'FAILED', 'REFUNDED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminOrdersQuery = z.infer<typeof AdminOrdersQuerySchema>;

export interface AdminOrderListItemDto {
  orderNo: string;
  status: AdminOrderStatus;
  paymentStatus: string;
  paymentMethod: string;
  grandTotal: string;
  itemCount: number;
  poNumber: string | null;
  email: string;
  customerName: string;
  createdAt: string;
}

function listWhere(query: AdminOrdersQuery): Prisma.OrderWhereInput {
  return {
    ...(query.status !== undefined ? { status: query.status } : {}),
    ...(query.paymentStatus !== undefined ? { paymentStatus: query.paymentStatus } : {}),
    ...(query.q !== undefined && query.q !== ''
      ? {
          OR: [
            { orderNo: { contains: query.q, mode: 'insensitive' } },
            { poNumber: { contains: query.q, mode: 'insensitive' } },
            { user: { email: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
}

export const adminOrdersService = {
  /** GET /admin/orders — filtered, paginated, newest first. */
  async listOrders(query: AdminOrdersQuery) {
    const where = listWhere(query);
    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { items: { select: { quantity: true } }, user: { select: { email: true, firstName: true, lastName: true } } },
      }),
      prisma.order.count({ where }),
    ]);
    const items: AdminOrderListItemDto[] = rows.map((row) => ({
      orderNo: row.orderNo,
      status: row.status as AdminOrderStatus,
      paymentStatus: row.paymentStatus,
      paymentMethod: row.paymentMethod,
      grandTotal: row.grandTotal.toFixed(2),
      itemCount: row.items.reduce((sum, item) => sum + item.quantity, 0),
      poNumber: row.poNumber,
      email: row.user.email,
      customerName: `${row.user.firstName} ${row.user.lastName}`,
      createdAt: row.createdAt.toISOString(),
    }));
    return {
      items,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  },

  /** GET /admin/orders/:orderNo — detail (unscoped) with items + timeline. */
  async getOrder(orderNo: string) {
    const row = await prisma.order.findUnique({
      where: { orderNo },
      include: {
        items: true,
        events: { orderBy: { createdAt: 'asc' } },
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    });
    if (row === null) throw new AppError(ERR.ORDER_NOT_FOUND, 'Order not found', 404);
    return {
      order: toOrderDetailDto(row as never),
      customer: { email: row.user.email, name: `${row.user.firstName} ${row.user.lastName}` },
    };
  },

  /**
   * PATCH /admin/orders/:orderNo — state-machine-validated transition (+ notes
   * edit). One transaction: order update, OrderEvent, audit log; the customer
   * email is NOT auto-resent (explicit endpoint below).
   */
  async updateOrder(
    orderNo: string,
    input: { status?: AdminOrderStatus; notes?: string | null },
    actor: { userId: string; ip: string | null },
  ) {
    const existing = await prisma.order.findUnique({ where: { orderNo } });
    if (existing === null) throw new AppError(ERR.ORDER_NOT_FOUND, 'Order not found', 404);

    if (input.status !== undefined && input.status !== existing.status) {
      const allowed = ALLOWED[existing.status as AdminOrderStatus];
      if (!allowed.includes(input.status)) {
        throw new AppError(
          ERR.CONFLICT,
          `Cannot transition ${existing.status} → ${input.status}`,
          409,
          { from: existing.status, to: input.status, allowed },
        );
      }
    }

    await withTransaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: existing.id },
        data: {
          ...(input.status !== undefined && input.status !== existing.status ? { status: input.status } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });
      if (input.status !== undefined && input.status !== existing.status) {
        await tx.orderEvent.create({
          data: { orderId: existing.id, status: updated.status, note: `Status set by staff (${input.status})` },
        });
        await writeAudit(
          actor.userId,
          'order.status',
          'order',
          existing.id,
          { from: existing.status, to: input.status },
          actor.ip,
          tx,
        );
      } else if (input.notes !== undefined) {
        await writeAudit(actor.userId, 'order.notes', 'order', existing.id, { notes: input.notes }, actor.ip, tx);
      }
    });

    return this.getOrder(orderNo);
  },

  /** POST /admin/orders/:orderNo/resend-email — re-enqueue the confirmation. */
  async resendEmail(orderNo: string) {
    const row = await prisma.order.findUnique({ where: { orderNo }, select: { id: true } });
    if (row === null) throw new AppError(ERR.ORDER_NOT_FOUND, 'Order not found', 404);
    await queue.enqueue(ORDER_CONFIRMATION_QUEUE, { orderId: row.id });
    return { queued: true };
  },

  /** GET /admin/orders/export — CSV of all rows matching the filters. */
  async exportCsv(query: AdminOrdersQuery): Promise<string> {
    const rows = await prisma.order.findMany({
      where: listWhere(query),
      orderBy: { createdAt: 'desc' },
      take: 50_000,
      include: { items: { select: { quantity: true } }, user: { select: { email: true } } },
    });
    const header = 'order_no;created_at;status;payment_status;payment_method;email;items;grand_total_inr;po_number';
    const lines = rows.map((row) =>
      [
        row.orderNo,
        row.createdAt.toISOString(),
        row.status,
        row.paymentStatus,
        row.paymentMethod,
        row.user.email,
        row.items.reduce((sum, item) => sum + item.quantity, 0),
        row.grandTotal.toFixed(2),
        row.poNumber ?? '',
      ].join(';'),
    );
    return [header, ...lines].join('\n');
  },
};
