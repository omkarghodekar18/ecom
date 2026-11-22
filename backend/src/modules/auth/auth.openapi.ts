// OpenAPI registration for the auth module (served at /api/docs).
import { z } from 'zod';
import { openApiRegistry } from '../../openapi.js';
import {
  ForgotPasswordInputSchema,
  LoginPasswordInputSchema,
  MeDtoSchema,
  OtpRequestInputSchema,
  OtpVerifyInputSchema,
  RegisterInputSchema,
  ResetPasswordInputSchema,
  VerifyEmailInputSchema,
} from '../../shared/dto/auth.dto.js';

/** Wraps a data schema in the standard success envelope. */
const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data });

const messageSchema = envelope(z.object({ message: z.string() }));
const sessionSchema = envelope(z.object({ user: MeDtoSchema, accessToken: z.string() }));
const meSchema = envelope(MeDtoSchema);

const jsonBody = (schema: z.ZodType) => ({ content: { 'application/json': { schema } }, required: true });

const jsonResponse = (description: string, schema?: z.ZodType) => ({
  description,
  ...(schema ? { content: { 'application/json': { schema } } } : {}),
});

const badRequest = jsonResponse(
  'Validation failed (VALIDATION_ERROR) or invalid/expired code (OTP_INVALID / OTP_EXPIRED / OTP_MAX_ATTEMPTS)',
);
const tooMany = jsonResponse('Rate limited (RATE_LIMITED), OTP cooldown (OTP_COOLDOWN) or account locked (ACCOUNT_LOCKED)');

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/register',
  tags: ['Auth'],
  description: 'Registers a B2C/B2B customer and emails a verification OTP. Always 202 with a generic message.',
  request: { body: jsonBody(RegisterInputSchema) },
  responses: { '202': jsonResponse('Generic anti-enumeration response', messageSchema), '400': badRequest, '429': tooMany },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/verify-email',
  tags: ['Auth'],
  description: 'Consumes the REGISTER OTP, activates the account and starts a session (sets th_rt + th_csrf cookies).',
  request: { body: jsonBody(VerifyEmailInputSchema) },
  responses: { '200': jsonResponse('Account verified and signed in', sessionSchema), '400': badRequest, '429': tooMany },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/login/password',
  tags: ['Auth'],
  description: 'Email + password login. Sets rotating refresh and CSRF cookies.',
  request: { body: jsonBody(LoginPasswordInputSchema) },
  responses: {
    '200': jsonResponse('Signed in', sessionSchema),
    '400': badRequest,
    '401': jsonResponse('Invalid credentials (INVALID_CREDENTIALS)'),
    '403': jsonResponse('Email not verified (EMAIL_UNVERIFIED) or account inactive (ACCOUNT_INACTIVE)'),
    '429': tooMany,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/login/otp/request',
  tags: ['Auth'],
  description: 'Passwordless login step 1: emails a LOGIN OTP to verified users. Always 202 with a generic message.',
  request: { body: jsonBody(OtpRequestInputSchema) },
  responses: { '202': jsonResponse('Generic anti-enumeration response', messageSchema), '429': tooMany },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/login/otp/verify',
  tags: ['Auth'],
  description: 'Passwordless login step 2: consumes the LOGIN OTP and starts a session.',
  request: { body: jsonBody(OtpVerifyInputSchema) },
  responses: {
    '200': jsonResponse('Signed in', sessionSchema),
    '400': badRequest,
    '401': jsonResponse('Invalid credentials (INVALID_CREDENTIALS)'),
    '429': tooMany,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/refresh',
  tags: ['Auth'],
  description:
    'Rotates the th_rt refresh cookie. Requires the X-CSRF-Token header (double-submit). Replaying a rotated token revokes the whole family.',
  responses: {
    '200': jsonResponse('New access token and rotated cookies', sessionSchema),
    '401': jsonResponse('Missing/invalid/reused refresh token (TOKEN_INVALID)'),
    '403': jsonResponse('CSRF check failed (CSRF_FAILED)'),
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/logout',
  tags: ['Auth'],
  description: 'Revokes the presented refresh token and clears session cookies. CSRF-guarded.',
  responses: { '204': jsonResponse('Signed out'), '403': jsonResponse('CSRF check failed (CSRF_FAILED)') },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/logout-all',
  tags: ['Auth'],
  description: 'Revokes every refresh token of the authenticated user (all devices).',
  responses: { '204': jsonResponse('All sessions revoked'), '401': jsonResponse('Not authenticated') },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/password/forgot',
  tags: ['Auth'],
  description: 'Emails a RESET_PASSWORD OTP to verified users. Always 202 with a generic message.',
  request: { body: jsonBody(ForgotPasswordInputSchema) },
  responses: { '202': jsonResponse('Generic anti-enumeration response', messageSchema), '429': tooMany },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/password/reset',
  tags: ['Auth'],
  description: 'Consumes the RESET_PASSWORD OTP, sets the new password and revokes all sessions.',
  request: { body: jsonBody(ResetPasswordInputSchema) },
  responses: { '204': jsonResponse('Password reset'), '400': badRequest, '429': tooMany },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/auth/me',
  tags: ['Auth'],
  description: 'Current user snapshot (requires Authorization: Bearer).',
  responses: {
    '200': jsonResponse('Current user', meSchema),
    '401': jsonResponse('Not authenticated (UNAUTHORIZED / TOKEN_INVALID / TOKEN_EXPIRED)'),
  },
});
