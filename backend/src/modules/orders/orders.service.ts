// Orders service (spec 6.9): the customer's order history and detail with the
// status timeline, plus reorder (all lines back into the cart).
import { z } from 'zod';
import { ERR } from '../../config/constants.js';
import { AppError } from '../../common/errors/app-error.js';
import type { OrderDetailDto, OrderListItemDto } from '../../shared/dto/order.dto.js';
import type { PageMeta } from '../../common/response/http.js';
import { ordersRepository } from './orders.repository.js';
import { toOrderDetailDto, toOrderListItemDto } from './orders.mapper.js';

export const ListOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListOrdersQuery = z.infer<typeof ListOrdersQuerySchema>;

export const ordersService = {
  /** GET /orders — the caller's orders, newest first. */
  async listOrders(userId: string, query: ListOrdersQuery): Promise<{ items: OrderListItemDto[]; meta: PageMeta }> {
    const [rows, total] = await Promise.all([
      ordersRepository.findOrdersByUserId(userId, query.page, query.pageSize),
      ordersRepository.countOrdersByUserId(userId),
    ]);
    return {
      items: rows.map(toOrderListItemDto),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  },

  /** GET /orders/:orderNo — owner-scoped (ORDER_NOT_FOUND for anyone else's). */
  async getOrder(userId: string, orderNo: string): Promise<OrderDetailDto> {
    const row = await ordersRepository.findOrderByOrderNo(orderNo, { userId });
    if (row === null) {
      throw new AppError(ERR.ORDER_NOT_FOUND, 'Order not found', 404);
    }
    return toOrderDetailDto(row);
  },
};
