// Auth contract zod schemas + inferred types (spec Sections 9/10).
// Mirrored into frontend/src/shared/dto, so it may import ONLY from 'zod'
// (plus values from ../enums.js, which itself only imports from 'zod').
import { z } from 'zod';
import { RoleSchema, UserTypeSchema } from '../enums.js';

/**
 * Password rule (spec Section 10): min 10 chars, at least one letter and one digit.
 * Argon2id hashing happens server-side; this is the shared client+server rule.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/\d/, 'Password must contain at least one digit');

/**
 * Lower-cased, trimmed email — canonical form used everywhere (login, OTP,
 * uniqueness). Trimming runs BEFORE the format check so `" A@B.co "` is
 * accepted as `a@b.co` (users paste addresses with stray spaces constantly).
 */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

/** 6-digit OTP code (spec Section 10). */
export const otpCodeSchema = z.string().regex(/^\d{6}$/, 'OTP code must be exactly 6 digits');

/** GSTIN: 15 chars — 2-digit state code, 5 letters, 4 digits, letter, alphanumeric, 'Z', checksum char. */
const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, 'Invalid GSTIN format');

/** Registration payload for B2C customers: no company fields. */
const registerB2CInput = z.object({
  type: z.literal('B2C'),
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z
    .string()
    .trim()
    .regex(/^[+0-9][0-9\-()\s]{5,24}$/, 'Invalid phone number')
    .optional(),
});

/** Registration payload for B2B customers: company name required, GSTIN optional. */
const registerB2BInput = registerB2CInput.extend({
  type: z.literal('B2B'),
  companyName: z.string().trim().min(2).max(160),
  gstin: gstinSchema.optional(),
});

/** `POST /auth/register` body (spec Sections 9/10). */
export const RegisterInputSchema = z.discriminatedUnion('type', [registerB2CInput, registerB2BInput]);
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

/** `POST /auth/verify-email` body — consumes the OTP sent at registration. */
export const VerifyEmailInputSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
});
export type VerifyEmailInput = z.infer<typeof VerifyEmailInputSchema>;

/** `POST /auth/login/password` body. */
export const LoginPasswordInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});
export type LoginPasswordInput = z.infer<typeof LoginPasswordInputSchema>;

/** `POST /auth/login/otp/request` body. */
export const OtpRequestInputSchema = z.object({
  email: emailSchema,
});
export type OtpRequestInput = z.infer<typeof OtpRequestInputSchema>;

/** `POST /auth/login/otp/verify` body. */
export const OtpVerifyInputSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
});
export type OtpVerifyInput = z.infer<typeof OtpVerifyInputSchema>;

/** `POST /auth/password/forgot` body (triggers a RESET_PASSWORD OTP). */
export const ForgotPasswordInputSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordInputSchema>;

/** `POST /auth/password/reset` body — OTP + new password (reset via OTP, spec Section 10). */
export const ResetPasswordInputSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordInputSchema>;

/** `GET /auth/me` response payload. */
export const MeDtoSchema = z.object({
  id: z.string().min(1),
  email: emailSchema,
  firstName: z.string(),
  lastName: z.string(),
  role: RoleSchema,
  type: UserTypeSchema,
  companyId: z.string().optional(),
  companyName: z.string().optional(),
  emailVerified: z.boolean(),
});
export type MeDto = z.infer<typeof MeDtoSchema>;
