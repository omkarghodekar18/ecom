// Checkout routes — auth-gated by design (spec 6.6/6.7: login required only at
// checkout). Full /checkout sub-path space, mounted at the API root.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { asyncHandler } from '../../common/response/http.js';
import { checkoutController } from './checkout.controller.js';

export const checkoutRouter = Router();

checkoutRouter.post('/checkout/validate', authenticate, asyncHandler(checkoutController.validate));
checkoutRouter.post('/checkout/place-order', authenticate, asyncHandler(checkoutController.placeOrder));
checkoutRouter.post(
  '/checkout/payments/razorpay/verify',
  authenticate,
  asyncHandler(checkoutController.verifyRazorpay),
);
