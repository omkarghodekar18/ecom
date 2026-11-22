// Order/checkout contract (spec 6.7/6.9/11). Money travels as strings.
// Mirrored to frontend — only zod + relative imports.
import { z } from 'zod';
import { AddressInputSchema } from './address.dto.js';
import { VariantAttributesSchema } from './product.dto.js';

export const DeliveryMethodSchema = z.enum(['standard', 'express']);
export type DeliveryMethod = z.infer<typeof DeliveryMethodSchema>;

export const PaymentMethodSchema = z.enum(['INVOICE', 'REQUEST', 'RAZORPAY']);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

/** Address snapshot stored on the order (checkout accepts any valid address). */
export const AddressSnapshotSchema = AddressInputSchema.pick({
  contactName: true,
  phone: true,
  line1: true,
  line2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  gstin: true,
});
export type AddressSnapshot = z.infer<typeof AddressSnapshotSchema>;

/** Body of POST /checkout/place-order. */
export const PlaceOrderInputSchema = z.object({
  shippingAddress: AddressSnapshotSchema,
  billingAddress: AddressSnapshotSchema.optional(),
  /** Optional trace to the saved address the snapshot was taken from. */
  addressId: z.string().optional(),
  deliveryMethod: DeliveryMethodSchema,
  paymentMethod: PaymentMethodSchema,
  poNumber: z.string().trim().min(1).max(40).optional(),
  notes: z.string().trim().min(1).max(1000).optional(),
  /** Replaying the same key returns the original order (idempotency, spec Section 9). */
  idempotencyKey: z.string().trim().min(8).max(64).optional(),
});
export type PlaceOrderInput = z.infer<typeof PlaceOrderInputSchema>;

/** Body of POST /checkout/validate (every field optional; checked when present). */
export const CheckoutValidateInputSchema = PlaceOrderInputSchema.partial();
export type CheckoutValidateInput = z.infer<typeof CheckoutValidateInputSchema>;

export interface CheckoutIssue {
  code: string;
  message: string;
  variantId?: string;
}

export const CheckoutValidateResultSchema = z.object({
  ok: z.boolean(),
  issues: z.array(z.object({ code: z.string(), message: z.string(), variantId: z.string().nullable() })),
  /** Totals preview (null when the cart is empty or a check failed). */
  totals: z
    .object({
      subtotal: z.string(),
      taxRatePercent: z.number(),
      taxTotal: z.string(),
      shippingTotal: z.string(),
      grandTotal: z.string(),
    })
    .nullable(),
  itemCount: z.number().int(),
});
export type CheckoutValidateResult = z.infer<typeof CheckoutValidateResultSchema>;

export const OrderEventDtoSchema = z.object({
  id: z.string(),
  status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type OrderEventDto = z.infer<typeof OrderEventDtoSchema>;

export const OrderItemDtoSchema = z.object({
  id: z.string(),
  variantId: z.string().nullable(),
  articleNo: z.string(),
  name: z.string(),
  attributesSnapshot: VariantAttributesSchema.nullable(),
  image: z.string().nullable(),
  unitPrice: z.string(),
  quantity: z.number().int(),
  lineTotal: z.string(),
});
export type OrderItemDto = z.infer<typeof OrderItemDtoSchema>;

export const OrderListItemDtoSchema = z.object({
  orderNo: z.string(),
  status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
  paymentStatus: z.enum(['UNPAID', 'PAID', 'FAILED', 'REFUNDED']),
  paymentMethod: z.string(),
  grandTotal: z.string(),
  currency: z.string(),
  itemCount: z.number().int(),
  createdAt: z.string(),
});
export type OrderListItemDto = z.infer<typeof OrderListItemDtoSchema>;

export const OrderDetailDtoSchema = OrderListItemDtoSchema.extend({
  shippingAddress: AddressSnapshotSchema,
  billingAddress: AddressSnapshotSchema,
  poNumber: z.string().nullable(),
  notes: z.string().nullable(),
  subtotal: z.string(),
  taxTotal: z.string(),
  shippingTotal: z.string(),
  items: z.array(OrderItemDtoSchema),
  events: z.array(OrderEventDtoSchema),
});
export type OrderDetailDto = z.infer<typeof OrderDetailDtoSchema>;

/** place-order response: the order plus payment hand-off info (gateway order id
 * for RAZORPAY checkout.js; null for offline methods). */
export const PlaceOrderResultSchema = OrderDetailDtoSchema.extend({
  payment: z.object({ gatewayRef: z.string().nullable() }),
});
export type PlaceOrderResult = z.infer<typeof PlaceOrderResultSchema>;

/** Body of POST /quick-order/validate. */
export const QuickOrderValidateSchema = z.object({
  lines: z
    .array(
      z.object({
        articleNo: z.string().trim().min(1).max(40),
        quantity: z.number().int().positive().max(100_000),
      }),
    )
    .min(1)
    .max(200),
});
export type QuickOrderValidateInput = z.infer<typeof QuickOrderValidateSchema>;

export const QuickOrderLineResultSchema = z.object({
  articleNo: z.string(),
  ok: z.boolean(),
  variant: z
    .object({
      id: z.string(),
      articleNo: z.string(),
      name: z.string().nullable(),
      productName: z.string(),
      brandName: z.string(),
      image: z.string().nullable(),
      unitPrice: z.string(),
      currency: z.string(),
      minOrderQty: z.number().int(),
      packSize: z.number().int(),
      stockQty: z.number().int(),
    })
    .nullable(),
  /** Quantity after min-order/pack/stock rules (present when ok). */
  adjustedQuantity: z.number().int().nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});
export type QuickOrderLineResult = z.infer<typeof QuickOrderLineResultSchema>;
