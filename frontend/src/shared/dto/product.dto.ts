// Product/variant/listing contract. Money travels as strings (Decimal(12,2)).
// Mirrored to frontend — only zod + relative imports.
import { z } from 'zod';
import { CrumbDtoSchema } from './catalog.dto';

export const AvailabilityDtoSchema = z.object({
  tone: z.enum(['green', 'amber', 'red']),
  label: z.string(),
  stockQty: z.number().int(),
  leadTimeMinDays: z.number().int().nullable(),
  leadTimeMaxDays: z.number().int().nullable(),
});
export type AvailabilityDto = z.infer<typeof AvailabilityDtoSchema>;

export const ImageDtoSchema = z.object({
  id: z.string(),
  url: z.string(),
  alt: z.string().nullable(),
  kind: z.enum(['PHOTO', 'DRAWING', 'TECHNICAL', 'OTHER']),
  variantId: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type ImageDto = z.infer<typeof ImageDtoSchema>;

export const DocumentDtoSchema = z.object({
  id: z.string(),
  kind: z.enum(['DATASHEET', 'CAD', 'MANUAL', 'CERTIFICATE', 'OTHER']),
  title: z.string(),
  url: z.string(),
  sizeBytes: z.number().int().nullable(),
});
export type DocumentDto = z.infer<typeof DocumentDtoSchema>;

export const PriceTierDtoSchema = z.object({
  minQty: z.number().int(),
  price: z.string(),
});
export type PriceTierDto = z.infer<typeof PriceTierDtoSchema>;

/** Flat attribute map on a variant, e.g. { cutter_diameter: '0.5', tool_material: 'HSS-E' }. */
export const VariantAttributesSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));
export type VariantAttributes = z.infer<typeof VariantAttributesSchema>;

export const VariantDtoSchema = z.object({
  id: z.string(),
  articleNo: z.string(),
  ean: z.string().nullable(),
  name: z.string().nullable(),
  listPrice: z.string(),
  currency: z.string(),
  priceUnit: z.number().int(),
  unitLabel: z.string(),
  taxClass: z.string(),
  stockQty: z.number().int(),
  leadTimeMinDays: z.number().int().nullable(),
  leadTimeMaxDays: z.number().int().nullable(),
  minOrderQty: z.number().int(),
  packSize: z.number().int(),
  isActive: z.boolean(),
  priceTiers: z.array(PriceTierDtoSchema),
  attributes: VariantAttributesSchema,
  availability: AvailabilityDtoSchema,
});
export type VariantDto = z.infer<typeof VariantDtoSchema>;

/** Listing row (list & tile views). */
export const ListingProductDtoSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  brandName: z.string(),
  brandSlug: z.string(),
  firstArticleNo: z.string(),
  /** Id of the first active variant — single-variant rows add it to the cart directly. */
  firstVariantId: z.string(),
  isBestseller: z.boolean(),
  variantCount: z.number().int(),
  priceFrom: z.string().nullable(),
  image: z.string().nullable(),
  imageAlt: z.string().nullable(),
  availability: AvailabilityDtoSchema,
});
export type ListingProductDto = z.infer<typeof ListingProductDtoSchema>;

export const SortSchema = z.enum(['relevance', 'price_asc', 'price_desc', 'name', 'bestseller', 'newest']);
export type Sort = z.infer<typeof SortSchema>;

export const FacetValueDtoSchema = z.object({
  value: z.string(),
  count: z.number().int(),
});

export const FacetDtoSchema = z.object({
  key: z.string(),
  label: z.string(),
  labelHtml: z.string().nullable(),
  groupName: z.string(),
  widget: z.enum(['CHECKBOX', 'RANGE', 'DROPDOWN']),
  unit: z.string().nullable(),
  values: z.array(FacetValueDtoSchema),
  range: z.object({ min: z.number(), max: z.number() }).nullable(),
});
export type FacetDto = z.infer<typeof FacetDtoSchema>;

export const ListingResponseSchema = z.object({
  items: z.array(ListingProductDtoSchema),
  facets: z.array(FacetDtoSchema),
  total: z.number().int(),
  sort: SortSchema,
  categoryPath: z.array(CrumbDtoSchema).optional(),
});
export type ListingResponse = z.infer<typeof ListingResponseSchema>;

/** Technical-data row on the PDP (attribute + resolved value). */
export const TechDataDtoSchema = z.object({
  key: z.string(),
  label: z.string(),
  labelHtml: z.string().nullable(),
  groupName: z.string(),
  unit: z.string().nullable(),
  type: z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'ENUM']),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});
export type TechDataDto = z.infer<typeof TechDataDtoSchema>;

export const ProductDetailDtoSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  brand: z.object({ slug: z.string(), name: z.string(), isPremium: z.boolean() }),
  category: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    pathSlugs: z.string(),
    path: z.array(CrumbDtoSchema),
  }),
  shortDescription: z.string().nullable(),
  descriptionHtml: z.string().nullable(),
  isBestseller: z.boolean(),
  priceFrom: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  images: z.array(ImageDtoSchema),
  documents: z.array(DocumentDtoSchema),
  variants: z.array(VariantDtoSchema),
  techData: z.array(TechDataDtoSchema),
});
export type ProductDetailDto = z.infer<typeof ProductDetailDtoSchema>;

/** `POST /pricing/resolve` — effective unit prices for the caller. */
export const ResolvedPriceDtoSchema = z.object({
  variantId: z.string(),
  articleNo: z.string(),
  quantity: z.number().int(),
  unitPrice: z.string(),
  basis: z.enum(['customer', 'tier', 'list']),
  listPrice: z.string(),
});
export type ResolvedPriceDto = z.infer<typeof ResolvedPriceDtoSchema>;
