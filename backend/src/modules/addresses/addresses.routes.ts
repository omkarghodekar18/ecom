// Addresses routes — address book CRUD, all Bearer-authenticated.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { asyncHandler } from '../../common/response/http.js';
import { addressesController } from './addresses.controller.js';

export const addressesRouter = Router();

addressesRouter.get('/', authenticate, asyncHandler(addressesController.list));
addressesRouter.post('/', authenticate, asyncHandler(addressesController.create));
addressesRouter.patch('/:id', authenticate, asyncHandler(addressesController.update));
addressesRouter.delete('/:id', authenticate, asyncHandler(addressesController.remove));
