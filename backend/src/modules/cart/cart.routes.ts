// Cart routes (spec Section 9): defines the FULL /cart sub-path space with
// absolute-in-router paths — mounted at the API root.
//   app.use(API_PREFIX, cartRouter)
// Guest mutations rely on the th_cart cookie; CSRF is not double-submit here
// because every handler only accepts application/json bodies (cross-site form
// posts cannot carry a JSON content type), and cross-site fetches with a JSON
// content type require a CORS preflight the allow-list denies. Documented in
// the module README.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { optionalAuthenticate } from '../../common/middleware/optional-auth.js';
import { asyncHandler } from '../../common/response/http.js';
import { cartController } from './cart.controller.js';

export const cartRouter = Router();

cartRouter.get('/cart', optionalAuthenticate, asyncHandler(cartController.getCart));
cartRouter.post('/cart/items', optionalAuthenticate, asyncHandler(cartController.addItem));
cartRouter.patch('/cart/items/:id', optionalAuthenticate, asyncHandler(cartController.updateItem));
cartRouter.delete('/cart/items/:id', optionalAuthenticate, asyncHandler(cartController.removeItem));
cartRouter.post('/cart/merge', authenticate, asyncHandler(cartController.merge));
cartRouter.post('/cart/import-csv', optionalAuthenticate, asyncHandler(cartController.importCsv));
