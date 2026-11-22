// Cart contract (spec Section 11 / 6.6). Money travels as strings (Decimal(12,2)).
// Mirrored to frontend — only zod + relative imports.
import { z } from 'zod';
import { AvailabilityDtoSchema, VariantAttributesSchema } from './product.dto.js';

export const CartItemDtoSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  articleNo: z.string(),
  productName: z.string(),
  /** Product slug — cart lines link back to the PDP. */
  productSlug: z.string(),
  variantName: z.string().nullable(),
  brandName: z.string(),
  attributes: VariantAttributesSchema,
  image: z.string().nullable(),
  imageAlt: z.string().nullable(),
  unitPrice: z.string(),
  listPrice: z.string(),
  /** Which rung of the price ladder produced unitPrice. */
  priceBasis: z.enum(['customer', 'tier', 'list']),
  quantity: z.number().int(),
  lineTotal: z.string(),
  currency: z.string(),
  minOrderQty: z.number().int(),
  packSize: z.number().int(),
  note: z.string().nullable(),
  availability: AvailabilityDtoSchema,
});
export type CartItemDto = z.infer<typeof CartItemDtoSchema>;

export const CartTotalsDtoSchema = z.object({
  subtotal: z.string(),
  taxRatePercent: z.number(),
  taxTotal: z.string(),
  shippingTotal: z.string(),
  grandTotal: z.string(),
  currency: z.string(),
  /** Subtotal at which standard delivery becomes free (from settings). */
  freeShippingThreshold: z.number().nullable(),
  shippingNote: z.string(),
});
export type CartTotalsDto = z.infer<typeof CartTotalsDtoSchema>;

/** One cart warning: qty adjustments, stock problems. `variantId` scopes it to a line. */
export const CartWarningDtoSchema = z.object({
  code: z.string(),
  message: z.string(),
  variantId: z.string().nullable(),
});
export type CartWarningDto = z.infer<typeof CartWarningDtoSchema>;

export const CartDtoSchema = z.object({
  /** null while the caller has no cart row yet (guest without cookie, user never added). */
  id: z.string().nullable(),
  currency: z.string(),
  itemCount: z.number().int(),
  items: z.array(CartItemDtoSchema),
  totals: CartTotalsDtoSchema,
  warnings: z.array(CartWarningDtoSchema),
});
export type CartDto = z.infer<typeof CartDtoSchema>;

/** Body of POST /cart/items. */
export const AddCartItemSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().positive().max(100_000),
  note: z.string().trim().max(500).optional(),
});
export type AddCartItemInput = z.infer<typeof AddCartItemSchema>;

/** Body of PATCH /cart/items/:id. */
export const UpdateCartItemSchema = z.object({
  quantity: z.number().int().positive().max(100_000).optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type UpdateCartItemInput = z.infer<typeof UpdateCartItemSchema>;

/** Body of POST /cart/import-csv (already-parsed quick-order lines). */
export const CartImportLineSchema = z.object({
  articleNo: z.string().trim().min(1).max(40),
  quantity: z.number().int().positive().max(100_000),
});
export const CartImportSchema = z.object({
  lines: z.array(CartImportLineSchema).min(1).max(200),
});
export type CartImportInput = z.infer<typeof CartImportSchema>;

export const CartImportResultSchema = z.object({
  articleNo: z.string(),
  ok: z.boolean(),
  /** Added/adjusted quantity when the line was added. */
  quantity: z.number().int().nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});
export type CartImportResult = z.infer<typeof CartImportResultSchema>;
