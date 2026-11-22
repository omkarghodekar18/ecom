// `authorize(...roles)` (spec Section 10 RBAC): middleware factory restricting
// the route to the given roles. Must run after `authenticate`.
import type { NextFunction, Request, Response } from 'express';
import { ERR } from '../../config/constants.js';
import { forbidden, unauthorized } from '../errors/app-error.js';
import type { Role } from '../../shared/enums.js';

/**
 * Builds a role guard. With no roles, any authenticated user passes
 * (pure "signed-in" check); otherwise `req.userRole` must be one of `roles`.
 */
export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.userId) {
      next(unauthorized('Authentication required', ERR.UNAUTHORIZED));
      return;
    }
    if (roles.length > 0 && !roles.includes(req.userRole as Role)) {
      next(forbidden());
      return;
    }
    next();
  };
}
