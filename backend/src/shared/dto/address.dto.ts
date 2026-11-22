// Address contract. Mirrored to frontend — only zod + relative imports.
import { z } from 'zod';

export const AddressInputSchema = z.object({
  label: z.string().trim().max(60).optional(),
  contactName: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(/^[+0-9][0-9\-()\s]{5,24}$/, 'Invalid phone number'),
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(160).optional().or(z.literal('')),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  postalCode: z.string().trim().regex(/^[0-9]{6}$/, 'Indian postal codes have 6 digits'),
  country: z.string().trim().length(2).toUpperCase().default('IN'),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, 'Invalid GSTIN format')
    .optional()
    .or(z.literal('')),
  isDefaultShipping: z.boolean().default(false),
  isDefaultBilling: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof AddressInputSchema>;

export const AddressDtoSchema = AddressInputSchema.extend({
  id: z.string(),
  gstin: z.string().nullable(),
  line2: z.string().nullable(),
  label: z.string().nullable(),
});
export type AddressDto = z.infer<typeof AddressDtoSchema>;
