// Auth routes (spec Sections 9/10) — all mounted under /api/v1/auth.
// Rate limits: login/register/forgot are strict (20 / 15 min); OTP-consuming
// endpoints slightly looser (30 / hour). Cookie-authenticated mutations
// (refresh, logout) are CSRF-guarded; logout-all is Bearer-authenticated.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { csrfMiddleware } from '../../common/middleware/csrf.js';
import { authLimiter } from '../../common/middleware/rate-limit.js';
import { asyncHandler } from '../../common/response/http.js';
import { authController } from './auth.controller.js';

const loginLimiter = authLimiter({ windowMs: 15 * 60_000, limit: 20 });
const otpLimiter = authLimiter({ windowMs: 60 * 60_000, limit: 30 });

export const authRouter = Router();

authRouter.post('/register', loginLimiter, asyncHandler(authController.register));
authRouter.post('/verify-email', otpLimiter, asyncHandler(authController.verifyEmail));
authRouter.post('/login/password', loginLimiter, asyncHandler(authController.loginPassword));
authRouter.post('/login/otp/request', otpLimiter, asyncHandler(authController.loginOtpRequest));
authRouter.post('/login/otp/verify', otpLimiter, asyncHandler(authController.loginOtpVerify));
authRouter.post('/refresh', csrfMiddleware, asyncHandler(authController.refresh));
authRouter.post('/logout', csrfMiddleware, asyncHandler(authController.logout));
authRouter.post('/logout-all', authenticate, asyncHandler(authController.logoutAll));
authRouter.post('/password/forgot', loginLimiter, asyncHandler(authController.forgotPassword));
authRouter.post('/password/reset', otpLimiter, asyncHandler(authController.resetPassword));
authRouter.get('/me', authenticate, asyncHandler(authController.me));
authRouter.get('/session', asyncHandler(authController.session));
