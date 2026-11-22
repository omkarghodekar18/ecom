// Company contract (B2B). Mirrored to frontend — only zod + relative imports.
import { z } from 'zod';

export const CompanyUserDtoSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']),
  isActive: z.boolean(),
  lastLoginAt: z.string().nullable(),
});
export type CompanyUserDto = z.infer<typeof CompanyUserDtoSchema>;

export const CompanyDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  gstin: z.string().nullable(),
  customerNumber: z.string().nullable(),
  users: z.array(CompanyUserDtoSchema),
});
export type CompanyDto = z.infer<typeof CompanyDtoSchema>;
