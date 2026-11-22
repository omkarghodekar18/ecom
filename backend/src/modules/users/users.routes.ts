// Users routes — account self-service, all Bearer-authenticated.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { asyncHandler } from '../../common/response/http.js';
import { usersController } from './users.controller.js';

export const usersRouter = Router();

usersRouter.get('/me/sessions', authenticate, asyncHandler(usersController.listSessions));
usersRouter.delete('/me/sessions/:id', authenticate, asyncHandler(usersController.revokeSession));
usersRouter.delete('/me/sessions', authenticate, asyncHandler(usersController.revokeOtherSessions));
usersRouter.patch('/me', authenticate, asyncHandler(usersController.updateProfile));
usersRouter.post('/me/password', authenticate, asyncHandler(usersController.changePassword));
