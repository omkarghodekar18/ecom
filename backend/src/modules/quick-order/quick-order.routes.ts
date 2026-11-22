// Quick-order controller + routes (spec Section 9). Resolution is public
// (guests can validate lines); adding to the cart is a cart-module call.
import type { Request, Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../../common/response/http.js';
import { ok } from '../../common/response/http.js';
import { QuickOrderValidateSchema } from '../../shared/dto/order.dto.js';
import { quickOrderService } from './quick-order.service.js';

async function validate(req: Request, res: Response): Promise<void> {
  const input = QuickOrderValidateSchema.parse(req.body);
  ok(res, await quickOrderService.validate(input));
}

export const quickOrderRouter = Router();
quickOrderRouter.post('/quick-order/validate', asyncHandler(validate));
