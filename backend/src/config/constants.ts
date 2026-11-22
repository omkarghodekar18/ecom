// Stable constants shared across modules. Error codes are part of the public
// API contract (docs/api.md) and are never renamed — only new codes are added.
export const API_PREFIX = '/api/v1';

export const ERR = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  EMAIL_UNVERIFIED: 'EMAIL_UNVERIFIED',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_COOLDOWN: 'OTP_COOLDOWN',
  OTP_MAX_ATTEMPTS: 'OTP_MAX_ATTEMPTS',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  CSRF_FAILED: 'CSRF_FAILED',
  CART_EMPTY: 'CART_EMPTY',
  CART_MISMATCH: 'CART_MISMATCH',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  MIN_ORDER_QTY: 'MIN_ORDER_QTY',
  PACK_SIZE: 'PACK_SIZE',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  IDENTITY_TAKEN: 'IDENTITY_TAKEN',
  IMPORT_INVALID_FILE: 'IMPORT_INVALID_FILE',
  IMPORT_VALIDATION_FAILED: 'IMPORT_VALIDATION_FAILED',
  IMPORT_NOT_READY: 'IMPORT_NOT_READY',
  IMPORT_LOCKED: 'IMPORT_LOCKED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  STORAGE_ERROR: 'STORAGE_ERROR',
  UNSAFE_URL: 'UNSAFE_URL',
} as const;

export type ErrorCode = keyof typeof ERR;

/**
 * AuthEvent audit kinds (spec Section 10). `AuthEvent.kind` is a free-form
 * string in the DB; this map is the code-side contract — kinds are never
 * renamed, only new ones added.
 */
export const AUTH_EVENT_KIND = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAIL: 'LOGIN_FAIL',
  OTP_REQUEST: 'OTP_REQUEST',
  OTP_CONSUMED: 'OTP_CONSUMED',
  LOCKOUT: 'LOCKOUT',
  LOGOUT: 'LOGOUT',
  LOGOUT_ALL: 'LOGOUT_ALL',
  PASSWORD_RESET: 'PASSWORD_RESET',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  REGISTER_DUPLICATE: 'REGISTER_DUPLICATE',
} as const;

export type AuthEventKind = keyof typeof AUTH_EVENT_KIND;

/** httpOnly cookie names (th_ = ToolHub). */
export const COOKIES = {
  refresh: 'th_rt',
  csrf: 'th_csrf',
  cart: 'th_cart',
} as const;

export const COOKIE_TTL_DAYS = {
  refresh: 30,
  cart: 60,
} as const;
