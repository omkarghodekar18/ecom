// Attribute seed (spec Section 22): drill attribute definitions mapped to the
// Centre drills / NC spotting drills / Jobber drills categories with filter
// widgets. Keys are STABLE — the import fixtures and sample workbook
// (sample-import.ts) reference them as `attr:<key>` columns.
//
// Note on `cutter_diameter_nominal` (NUMBER, isVariantAxis): the variants of a
// drill family differ exactly by this attribute, which is what the storefront
// variant axis switch renders. (The admin API's replaceMapping currently only
// accepts STRING/ENUM axes — the seed writes the mapping directly, so the
// NUMBER axis is honoured here as the spec demands.)
import { Prisma } from '@prisma/client';
import type { AttrType, FilterWidget } from '@prisma/client';
import type { Transaction } from '../../src/db/transaction-types.js';

export interface AttributeDef {
  key: string;
  label: string;
  labelHtml?: string;
  groupName: string;
  type: AttrType;
  unit?: string;
  enumValues?: string[];
}

export const ATTRIBUTES: AttributeDef[] = [
  {
    key: 'tool_material',
    label: 'Tool material',
    groupName: 'Material & composition',
    type: 'STRING',
  },
  {
    key: 'coating',
    label: 'Coating',
    groupName: 'Material & composition',
    type: 'ENUM',
    enumValues: ['TiAlN', 'TiN', 'TiCN', 'uncoated'],
  },
  {
    key: 'drilling_tool_type',
    label: 'Type of drilling tool',
    groupName: 'Tool version',
    type: 'ENUM',
    enumValues: ['centre drill type A', 'centre drill type B', 'centre drill type R', 'NC spotting drill'],
  },
  {
    key: 'cutter_diameter_nominal',
    label: 'Nominal ⌀ D k12',
    labelHtml: 'Nominal ⌀ D<sub>C</sub> k12',
    groupName: 'Dimensions & Measurements',
    type: 'NUMBER',
    unit: 'mm',
  },
  {
    key: 'overall_length',
    label: 'Overall length',
    groupName: 'Dimensions & Measurements',
    type: 'NUMBER',
    unit: 'mm',
  },
  {
    key: 'shaft_diameter',
    label: 'Shaft diameter',
    groupName: 'Dimensions & Measurements',
    type: 'NUMBER',
    unit: 'mm',
  },
  {
    key: 'din_standard',
    label: 'Standard',
    groupName: 'Machining group',
    type: 'STRING',
  },
  {
    key: 'workpiece_material',
    label: 'Suitable for workpiece material',
    groupName: 'Workpiece & machine suitability',
    type: 'ENUM',
    enumValues: ['steel', 'stainless steel', 'cast iron', 'non-ferrous metals', 'hardened steel'],
  },
  {
    key: 'tolerance_class',
    label: 'Tolerance class',
    groupName: 'Machining group',
    type: 'STRING',
  },
  {
    key: 'flute_length',
    label: 'Flute length',
    groupName: 'Dimensions & Measurements',
    type: 'STRING',
    unit: 'mm',
  },
  {
    key: 'diameter_ratio',
    label: 'Diameter ratio l/D',
    groupName: 'Tool version',
    type: 'STRING',
  },
];

export type AttributeKey = (typeof ATTRIBUTES)[number]['key'];

export interface MappingSpec {
  attributeKey: string;
  isRequired?: boolean;
  isFilterable?: boolean;
  isVariantAxis?: boolean;
  filterWidget?: FilterWidget;
  sortOrder: number;
}

const CENTRE_DRILL_MAPPINGS: MappingSpec[] = [
  { attributeKey: 'tool_material', isFilterable: true, filterWidget: 'CHECKBOX', sortOrder: 1 },
  { attributeKey: 'coating', isFilterable: true, filterWidget: 'CHECKBOX', sortOrder: 2 },
  { attributeKey: 'drilling_tool_type', isFilterable: true, filterWidget: 'CHECKBOX', sortOrder: 3 },
  {
    attributeKey: 'cutter_diameter_nominal',
    isRequired: true,
    isFilterable: true,
    isVariantAxis: true,
    filterWidget: 'RANGE',
    sortOrder: 4,
  },
  { attributeKey: 'overall_length', isFilterable: true, filterWidget: 'RANGE', sortOrder: 5 },
  { attributeKey: 'shaft_diameter', isFilterable: true, filterWidget: 'RANGE', sortOrder: 6 },
  { attributeKey: 'din_standard', isFilterable: false, filterWidget: 'DROPDOWN', sortOrder: 7 },
  { attributeKey: 'workpiece_material', isFilterable: true, filterWidget: 'CHECKBOX', sortOrder: 8 },
  { attributeKey: 'tolerance_class', isFilterable: false, filterWidget: 'DROPDOWN', sortOrder: 9 },
];

const NC_SPOTTING_MAPPINGS: MappingSpec[] = [
  { attributeKey: 'tool_material', isFilterable: true, filterWidget: 'CHECKBOX', sortOrder: 1 },
  { attributeKey: 'coating', isFilterable: true, filterWidget: 'CHECKBOX', sortOrder: 2 },
  { attributeKey: 'drilling_tool_type', isFilterable: true, filterWidget: 'CHECKBOX', sortOrder: 3 },
  {
    attributeKey: 'cutter_diameter_nominal',
    isRequired: true,
    isFilterable: true,
    isVariantAxis: true,
    filterWidget: 'RANGE',
    sortOrder: 4,
  },
  { attributeKey: 'overall_length', isFilterable: true, filterWidget: 'RANGE', sortOrder: 5 },
];

const JOBBER_MAPPINGS: MappingSpec[] = [
  { attributeKey: 'tool_material', isFilterable: true, filterWidget: 'CHECKBOX', sortOrder: 1 },
  { attributeKey: 'coating', isFilterable: true, filterWidget: 'CHECKBOX', sortOrder: 2 },
  {
    attributeKey: 'cutter_diameter_nominal',
    isRequired: true,
    isFilterable: true,
    isVariantAxis: true,
    filterWidget: 'RANGE',
    sortOrder: 3,
  },
  { attributeKey: 'flute_length', isFilterable: false, filterWidget: 'DROPDOWN', sortOrder: 4 },
  { attributeKey: 'diameter_ratio', isFilterable: false, filterWidget: 'DROPDOWN', sortOrder: 5 },
];

/** category code → mapping list (replaces any existing mapping on re-run). */
export const CATEGORY_MAPPINGS: Record<string, MappingSpec[]> = {
  '10-01-01-01-00': CENTRE_DRILL_MAPPINGS, // Centre drills
  '10-01-01-02-00': NC_SPOTTING_MAPPINGS, // NC spotting drills
  '10-01-01-03-00': JOBBER_MAPPINGS, // Jobber drills
};

/** Upserts all definitions, then (re)writes the three category mappings. */
export async function seedAttributes(
  tx: Transaction,
  categoryIds: Map<string, string>,
): Promise<{ definitions: number; mappings: number }> {
  const attributeIds = new Map<string, string>();
  for (const attr of ATTRIBUTES) {
    const data = {
      label: attr.label,
      labelHtml: attr.labelHtml ?? null,
      groupName: attr.groupName,
      type: attr.type,
      unit: attr.unit ?? null,
      // Prisma requires the DbNull sentinel (not JS null) for Json columns.
      enumValues: attr.enumValues ?? Prisma.DbNull,
    };
    const row = await tx.attributeDefinition.upsert({
      where: { key: attr.key },
      create: { key: attr.key, ...data },
      update: data,
    });
    attributeIds.set(attr.key, row.id);
  }

  let mappings = 0;
  for (const [categoryCode, specs] of Object.entries(CATEGORY_MAPPINGS)) {
    const categoryId = categoryIds.get(categoryCode);
    if (!categoryId) throw new Error(`Unknown category code in mapping: ${categoryCode}`);
    await tx.categoryAttribute.deleteMany({ where: { categoryId } });
    await tx.categoryAttribute.createMany({
      data: specs.map((spec) => ({
        categoryId,
        attributeId: attributeIds.get(spec.attributeKey) as string,
        isRequired: spec.isRequired ?? false,
        isFilterable: spec.isFilterable ?? true,
        isVariantAxis: spec.isVariantAxis ?? false,
        filterWidget: spec.filterWidget ?? 'CHECKBOX',
        sortOrder: spec.sortOrder,
      })),
    });
    mappings += specs.length;
  }
  return { definitions: ATTRIBUTES.length, mappings };
}

/** Prisma input type for a ProductAttributeValue row (used by products.ts). */
export type AttrValueInput = Prisma.ProductAttributeValueUncheckedCreateInput;
