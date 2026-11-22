// Account-area contract (users, sessions). Mirrored to frontend — only zod + relative imports.
import { z } from 'zod';
import { emailSchema } from './auth.dto.js';

/** `PATCH /users/me` body. */
export const UpdateProfileInputSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z
    .string()
    .trim()
    .regex(/^[+0-9][0-9\-()\s]{5,24}$/, 'Invalid phone number')
    .optional()
    .or(z.literal('')),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;

/** `POST /users/me/password` body (change password while signed in). */
export const ChangePasswordInputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(128).regex(/[A-Za-z]/).regex(/\d/),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>;

export const SessionDtoSchema = z.object({
  id: z.string(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: z.string(),
  /** True for the session that made the request. */
  current: z.boolean(),
});
export type SessionDto = z.infer<typeof SessionDtoSchema>;

/** `PATCH /users/me` response (same shape as MeDto). */
export const ProfileDtoSchema = z.object({
  id: z.string(),
  email: emailSchema,
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']),
  type: z.enum(['B2B', 'B2C']),
  companyId: z.string().optional(),
  companyName: z.string().optional(),
  emailVerified: z.boolean(),
});
export type ProfileDto = z.infer<typeof ProfileDtoSchema>;
