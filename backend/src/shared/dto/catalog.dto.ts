// Catalog contract: categories, navigation, brands, attributes.
// Mirrored to frontend — only zod + relative imports.
import { z } from 'zod';

export const CategoryDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  pathSlugs: z.string(),
  level: z.number().int(),
  productCount: z.number().int(),
  isActive: z.boolean(),
  image: z.string().nullable(),
  icon: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
});
export type CategoryDto = z.infer<typeof CategoryDtoSchema>;

export interface NavigationNodeDto {
  id: string;
  code: string;
  slug: string;
  name: string;
  level: number;
  productCount: number;
  icon: string | null;
  children: NavigationNodeDto[];
}

export const NavigationNodeDtoSchema: z.ZodType<NavigationNodeDto> = z.object({
  id: z.string(),
  code: z.string(),
  slug: z.string(),
  name: z.string(),
  level: z.number().int(),
  productCount: z.number().int(),
  icon: z.string().nullable(),
  children: z.array(z.lazy(() => NavigationNodeDtoSchema)),
});

export const BrandDtoSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  isPremium: z.boolean(),
  logo: z.string().nullable(),
  description: z.string().nullable(),
});
export type BrandDto = z.infer<typeof BrandDtoSchema>;

export const AttrTypeSchema = z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'ENUM']);
export const FilterWidgetSchema = z.enum(['CHECKBOX', 'RANGE', 'DROPDOWN']);

export const AttributeDtoSchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  labelHtml: z.string().nullable(),
  groupName: z.string(),
  type: AttrTypeSchema,
  unit: z.string().nullable(),
  enumValues: z.array(z.string()).nullable(),
});
export type AttributeDto = z.infer<typeof AttributeDtoSchema>;

/** Attribute + how it behaves on a category (filter set endpoint). */
export const CategoryAttributeDtoSchema = AttributeDtoSchema.extend({
  isRequired: z.boolean(),
  isFilterable: z.boolean(),
  isVariantAxis: z.boolean(),
  filterWidget: FilterWidgetSchema,
  sortOrder: z.number().int(),
});
export type CategoryAttributeDto = z.infer<typeof CategoryAttributeDtoSchema>;

/** Breadcrumb element (PDP/category pages). */
export const CrumbDtoSchema = z.object({
  name: z.string(),
  slug: z.string(),
  code: z.string(),
  pathSlugs: z.string(),
});
export type CrumbDto = z.infer<typeof CrumbDtoSchema>;
