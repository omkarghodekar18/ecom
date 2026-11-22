// Shared contract enums — the single source of truth (spec Section 3).
// The values MUST mirror prisma/schema.prisma enums exactly; this file is
// mirrored verbatim into frontend/src/shared, so it may import ONLY from 'zod'.
import { z } from 'zod';

/** Account role (spec Section 10 RBAC). Mirrors prisma enum `Role`. */
export const RoleSchema = z.enum(['CUSTOMER', 'STAFF', 'ADMIN']);

/** Customer segment. Mirrors prisma enum `UserType`. */
export const UserTypeSchema = z.enum(['B2B', 'B2C']);

/** What an OTP code is for. Mirrors prisma enum `OtpPurpose`. */
export const OtpPurposeSchema = z.enum(['REGISTER', 'LOGIN', 'RESET_PASSWORD']);

/** Product / CMS page lifecycle. Mirrors prisma enum `ProductStatus`. */
export const ProductStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

/** Order fulfilment state machine. Mirrors prisma enum `OrderStatus`. */
export const OrderStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
]);

/** Payment state of an order. Mirrors prisma enum `PaymentStatus`. */
export const PaymentStatusSchema = z.enum(['UNPAID', 'PAID', 'FAILED', 'REFUNDED']);

/** CMS banner slots (spec Section 6.1). Mirrors prisma enum `BannerPlacement`. */
export const BannerPlacementSchema = z.enum([
  'HOME_HERO',
  'HOME_SIDE_TOP',
  'HOME_SIDE_BOTTOM',
  'HOME_HIGHLIGHT',
  'MENU_TEASER',
]);

/** Facet widget a filterable attribute renders as. Mirrors prisma enum `FilterWidget`. */
export const FilterWidgetSchema = z.enum(['CHECKBOX', 'RANGE', 'DROPDOWN']);

/** Attribute value type. Mirrors prisma enum `AttrType`. */
export const AttrTypeSchema = z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'ENUM']);

/** Purpose of a product image. Mirrors prisma enum `ImageKind`. */
export const ImageKindSchema = z.enum(['PHOTO', 'DRAWING', 'TECHNICAL', 'OTHER']);

/** Product document kind. Mirrors prisma enum `DocKind`. */
export const DocKindSchema = z.enum(['DATASHEET', 'CAD', 'MANUAL', 'CERTIFICATE', 'OTHER']);

/** Bulk import job state machine (spec Section 16). Mirrors prisma enum `ImportStatus`. */
export const ImportStatusSchema = z.enum([
  'UPLOADED',
  'PARSING',
  'VALIDATING',
  'VALIDATED_WITH_ERRORS',
  'READY_TO_COMMIT',
  'COMMITTING',
  'COMPLETED',
  'FAILED',
  'ROLLED_BACK',
  'CANCELLED',
]);

/** Import row issue severity. Mirrors prisma enum `IssueSeverity`. */
export const IssueSeveritySchema = z.enum(['ERROR', 'WARNING']);

export type Role = z.infer<typeof RoleSchema>;
export type UserType = z.infer<typeof UserTypeSchema>;
export type OtpPurpose = z.infer<typeof OtpPurposeSchema>;
export type ProductStatus = z.infer<typeof ProductStatusSchema>;
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
export type BannerPlacement = z.infer<typeof BannerPlacementSchema>;
export type FilterWidget = z.infer<typeof FilterWidgetSchema>;
export type AttrType = z.infer<typeof AttrTypeSchema>;
export type ImageKind = z.infer<typeof ImageKindSchema>;
export type DocKind = z.infer<typeof DocKindSchema>;
export type ImportStatus = z.infer<typeof ImportStatusSchema>;
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;
