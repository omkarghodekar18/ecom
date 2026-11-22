// Cart controller — resolves the caller (optional bearer + guest cookie),
// runs the service flow and applies cookie side-effects on the response.
import type { Response, Request } from 'express';
import { COOKIES, COOKIE_TTL_DAYS } from '../../config/constants.js';
import { ok, okCreated } from '../../common/response/http.js';
import { requireUserId } from '../../common/middleware/authenticate.js';
import { cartService, CART_TTL_MS, type CartActor, type CartMutationResult } from './cart.service.js';

function guestToken(req: Request): string | null {
  const raw = req.cookies?.[COOKIES.cart];
  return typeof raw === 'string' && raw !== '' ? raw : null;
}

function actor(req: Request): CartActor {
  return { userId: req.userId ?? null, guestToken: guestToken(req) };
}

/** Cookie side-effects: set a fresh guest token or consume the merged one. */
function applyCookieEffects(res: Response, result: CartMutationResult): void {
  if (result.setGuestCookie !== undefined) {
    res.cookie(COOKIES.cart, result.setGuestCookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: CART_TTL_MS / 1000,
    });
  }
  if (result.clearGuestCookie === true) {
    res.clearCookie(COOKIES.cart, { path: '/' });
  }
}

export const cartController = {
  async getCart(req: Request, res: Response): Promise<void> {
    ok(res, await cartService.getCart(actor(req)));
  },

  async addItem(req: Request, res: Response): Promise<void> {
    const result = await cartService.addItem(actor(req), req.body);
    applyCookieEffects(res, result);
    okCreated(res, result.cart);
  },

  async updateItem(req: Request, res: Response): Promise<void> {
    const result = await cartService.updateItem(actor(req), String(req.params.id), req.body);
    applyCookieEffects(res, result);
    ok(res, result.cart);
  },

  async removeItem(req: Request, res: Response): Promise<void> {
    const result = await cartService.removeItem(actor(req), String(req.params.id));
    applyCookieEffects(res, result);
    ok(res, result.cart);
  },

  async merge(req: Request, res: Response): Promise<void> {
    const result = await cartService.mergeCarts(requireUserId(req), guestToken(req));
    applyCookieEffects(res, result);
    ok(res, result.cart);
  },

  async importCsv(req: Request, res: Response): Promise<void> {
    const result = await cartService.importCsv(actor(req), req.body);
    applyCookieEffects(res, result);
    ok(res, { cart: result.cart, results: result.results });
  },
};

/** Cookie TTL in days, re-exported for docs/tests. */
export const CART_COOKIE_TTL_DAYS = COOKIE_TTL_DAYS.cart;
