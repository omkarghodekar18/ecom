// Checkout controller — parse/validate and delegate.
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireUserId } from '../../common/middleware/authenticate.js';
import { ok } from '../../common/response/http.js';
import { checkoutService } from './checkout.service.js';
import { CheckoutValidateInputSchema, PlaceOrderInputSchema } from '../../shared/dto/order.dto.js';

const RazorpayVerifySchema = z.object({
  orderNo: z.string().min(1),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  signature: z.string().min(1),
});

export const checkoutController = {
  /** POST /checkout/validate — pre-flight (delivery method availability, stock, totals). */
  async validate(req: Request, res: Response): Promise<void> {
    const input = CheckoutValidateInputSchema.parse(req.body);
    ok(res, await checkoutService.validate(requireUserId(req), input));
  },

  /** POST /checkout/place-order — one-transaction placement. */
  async placeOrder(req: Request, res: Response): Promise<void> {
    const input = PlaceOrderInputSchema.parse(req.body);
    ok(res, await checkoutService.placeOrder(requireUserId(req), input), undefined, 201);
  },

  /** POST /checkout/payments/razorpay/verify — checkout callback (feature-flagged). */
  async verifyRazorpay(req: Request, res: Response): Promise<void> {
    const input = RazorpayVerifySchema.parse(req.body);
    ok(res, await checkoutService.verifyRazorpay(requireUserId(req), input));
  },
};
