// Orders routes — customer-facing order history (admin order management is a
// separate admin surface). Full /orders sub-path space, mounted at the API root.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { asyncHandler } from '../../common/response/http.js';
import { ordersController } from './orders.controller.js';

export const ordersRouter = Router();

ordersRouter.get('/orders', authenticate, asyncHandler(ordersController.list));
ordersRouter.get('/orders/:orderNo', authenticate, asyncHandler(ordersController.detail));
ordersRouter.post('/orders/:orderNo/reorder', authenticate, asyncHandler(ordersController.reorder));
