// Orders controller — parse/validate and delegate (spec Section 3).
import type { Request, Response } from 'express';
import { requireUserId } from '../../common/middleware/authenticate.js';
import { ok } from '../../common/response/http.js';
import { cartService } from '../cart/index.js';
import { ordersService, ListOrdersQuerySchema } from './orders.service.js';

export const ordersController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = ListOrdersQuerySchema.parse(req.query);
    const { items, meta } = await ordersService.listOrders(requireUserId(req), query);
    ok(res, items, meta);
  },

  async detail(req: Request, res: Response): Promise<void> {
    ok(res, await ordersService.getOrder(requireUserId(req), String(req.params.orderNo)));
  },

  /** POST /orders/:orderNo/reorder — all lines back into the cart (current prices/rules). */
  async reorder(req: Request, res: Response): Promise<void> {
    const userId = requireUserId(req);
    const order = await ordersService.getOrder(userId, String(req.params.orderNo));
    const lines = order.items.map((item) => ({ articleNo: item.articleNo, quantity: item.quantity }));
    if (lines.length === 0) {
      const cart = await cartService.getCart({ userId, guestToken: null });
      ok(res, cart);
      return;
    }
    const result = await cartService.importCsv({ userId, guestToken: null }, { lines });
    ok(res, result.cart);
  },
};
