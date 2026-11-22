// Auth controller: parses/validates input with the shared zod contracts and
// delegates to the auth/login services. Cookie handling stays here (transport).
import type { Request, Response } from 'express';
import { COOKIES, ERR } from '../../config/constants.js';
import { unauthorized } from '../../common/errors/app-error.js';
import { requireUserId } from '../../common/middleware/authenticate.js';
import { ok } from '../../common/response/http.js';
import {
  ForgotPasswordInputSchema,
  LoginPasswordInputSchema,
  OtpRequestInputSchema,
  OtpVerifyInputSchema,
  RegisterInputSchema,
  ResetPasswordInputSchema,
  VerifyEmailInputSchema,
} from '../../shared/dto/auth.dto.js';
import { applySessionCookies, clearSessionCookies } from './session.cookies.js';
import { GENERIC_AUTH_MESSAGE, authService, type SessionResult } from './auth.service.js';
import { loginService } from './login.service.js';

function respondWithSession(res: Response, result: SessionResult): void {
  applySessionCookies(res, result.session);
  ok(res, { user: result.user, accessToken: result.session.accessToken });
}

const noContent = (res: Response): void => {
  res.status(204).send();
};

/** Auth endpoint handlers — plain async functions; routes wrap them with asyncHandler. */
export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    const input = RegisterInputSchema.parse(req.body);
    await authService.register(input, req.ip ?? null);
    ok(res, { message: GENERIC_AUTH_MESSAGE }, undefined, 202);
  },

  async verifyEmail(req: Request, res: Response): Promise<void> {
    const input = VerifyEmailInputSchema.parse(req.body);
    respondWithSession(res, await authService.verifyEmail(input, req.ip ?? null, req));
  },

  async loginPassword(req: Request, res: Response): Promise<void> {
    const input = LoginPasswordInputSchema.parse(req.body);
    respondWithSession(res, await loginService.loginPassword(input, req.ip ?? null, req));
  },

  async loginOtpRequest(req: Request, res: Response): Promise<void> {
    const input = OtpRequestInputSchema.parse(req.body);
    await loginService.loginOtpRequest(input, req.ip ?? null);
    ok(res, { message: GENERIC_AUTH_MESSAGE }, undefined, 202);
  },

  async loginOtpVerify(req: Request, res: Response): Promise<void> {
    const input = OtpVerifyInputSchema.parse(req.body);
    respondWithSession(res, await loginService.loginOtpVerify(input, req.ip ?? null, req));
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const token: string | undefined = req.cookies?.[COOKIES.refresh];
    respondWithSession(res, await authService.refresh(token, req));
  },

  /** GET /auth/session — read-only cookie lookup for server-side guards (admin
   * layout): resolves the refresh cookie to the user WITHOUT rotating tokens. */
  async session(req: Request, res: Response): Promise<void> {
    const user = await authService.resolveSessionUser(req.cookies?.[COOKIES.refresh]);
    if (user === null) {
      throw unauthorized('No active session', ERR.UNAUTHORIZED);
    }
    ok(res, { user });
  },

  async logout(req: Request, res: Response): Promise<void> {
    const token: string | undefined = req.cookies?.[COOKIES.refresh];
    await authService.logout(token, req.ip ?? null);
    clearSessionCookies(res);
    noContent(res);
  },

  async logoutAll(req: Request, res: Response): Promise<void> {
    await authService.logoutAll(requireUserId(req), req.ip ?? null);
    clearSessionCookies(res);
    noContent(res);
  },

  async forgotPassword(req: Request, res: Response): Promise<void> {
    const input = ForgotPasswordInputSchema.parse(req.body);
    await authService.forgotPassword(input, req.ip ?? null);
    ok(res, { message: GENERIC_AUTH_MESSAGE }, undefined, 202);
  },

  async resetPassword(req: Request, res: Response): Promise<void> {
    const input = ResetPasswordInputSchema.parse(req.body);
    await authService.resetPassword(input, req.ip ?? null);
    noContent(res);
  },

  async me(req: Request, res: Response): Promise<void> {
    ok(res, await authService.me(requireUserId(req)));
  },
};
