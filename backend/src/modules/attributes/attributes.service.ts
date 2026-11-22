// Attributes service — attribute definitions (typed technical data fields)
// and the category→attribute mapping. Owns the mapping inheritance rule of
// spec 15.3: a category uses its OWN mapping, else the nearest ancestor's;
// the catalog filters endpoint and GET /attributes?categoryCode= share it.
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { badRequest, conflict, notFound } from '../../common/errors/app-error.js';
import { withTransaction } from '../../db/transaction.js';
import { writeAudit } from '../../services/audit/index.js';
import type { AttributeDto, CategoryAttributeDto } from '../../shared/dto/catalog.dto.js';
import { AttrTypeSchema, FilterWidgetSchema } from '../../shared/dto/catalog.dto.js';
import { afterCatalogWrite } from '../catalog/catalog.queue.js';
import {
  attributesRepository,
  type AttributeRow,
  type CategoryAttributeWithAttribute,
  type NewCategoryAttributeRow,
} from './attributes.repository.js';

// ── input contracts (shared/dto is frozen; module-owned schemas live here) ──

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const CreateAttributeInputSchema = z
  .object({
    key: z.string().min(1).max(80).regex(SLUG_PATTERN, {
      message: 'key must be a lowercase slug (a-z, 0-9, hyphen), e.g. cutter-diameter',
    }),
    label: z.string().min(1).max(200),
    labelHtml: z.string().max(2000).optional().nullable(),
    groupName: z.string().min(1).max(120),
    type: AttrTypeSchema,
    unit: z.string().max(40).optional().nullable(),
    enumValues: z.array(z.string().min(1).max(200)).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'ENUM') {
      if (val.enumValues === undefined || val.enumValues === null || val.enumValues.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['enumValues'],
          message: 'enumValues must be a non-empty array when type is ENUM',
        });
      } else if (new Set(val.enumValues).size !== val.enumValues.length) {
        ctx.addIssue({ code: 'custom', path: ['enumValues'], message: 'enumValues must not contain duplicates' });
      }
    } else if (val.enumValues !== undefined && val.enumValues !== null && val.enumValues.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['enumValues'],
        message: 'enumValues is only valid when type is ENUM',
      });
    }
  });
export type CreateAttributeInput = z.infer<typeof CreateAttributeInputSchema>;

export const UpdateAttributeInputSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  labelHtml: z.string().max(2000).optional().nullable(),
  groupName: z.string().min(1).max(120).optional(),
  type: AttrTypeSchema.optional(),
  unit: z.string().max(40).optional().nullable(),
  enumValues: z.array(z.string().min(1).max(200)).optional().nullable(),
});
export type UpdateAttributeInput = z.infer<typeof UpdateAttributeInputSchema>;

/** Body of PUT /admin/categories/:id/attributes — the bare replacement array. */
export const CategoryMappingInputSchema = z
  .array(
    z.object({
      attributeId: z.string().min(1),
      isRequired: z.boolean().default(false),
      isFilterable: z.boolean().default(true),
      isVariantAxis: z.boolean().default(false),
      filterWidget: FilterWidgetSchema.default('CHECKBOX'),
      sortOrder: z.number().int().default(0),
    }),
  )
  .max(200);
export type CategoryMappingInput = z.infer<typeof CategoryMappingInputSchema>;

// ── DTO mapping ─────────────────────────────────────────────────────────────

/** JsonValue → string[] for the DTO (defensive against corrupt rows). */
function normalizeEnumValues(value: Prisma.JsonValue | null): string[] | null {
  if (value === null || !Array.isArray(value)) return null;
  return value.map((v) => String(v));
}

function toAttributeDto(row: AttributeRow): AttributeDto {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    labelHtml: row.labelHtml,
    groupName: row.groupName,
    type: row.type,
    unit: row.unit,
    enumValues: normalizeEnumValues(row.enumValues),
  };
}

function toCategoryAttributeDto(row: CategoryAttributeWithAttribute): CategoryAttributeDto {
  return {
    ...toAttributeDto(row.attribute),
    isRequired: row.isRequired,
    isFilterable: row.isFilterable,
    isVariantAxis: row.isVariantAxis,
    filterWidget: row.filterWidget,
    sortOrder: row.sortOrder,
  };
}

/** Optional text fields may arrive as "" — store NULL instead. */
function blankToNull(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === '' ? null : value;
}

// ── effective mapping (spec 15.3 inheritance) ──────────────────────────────

/**
 * Attribute set a category effectively uses: its OWN mapping when non-empty,
 * otherwise the nearest ancestor's mapping walking up the materialised path.
 * Shared by GET /categories/:code/filters and GET /attributes?categoryCode=.
 */
async function effectiveMappingsForCategory(category: {
  id: string;
  path: string;
}): Promise<CategoryAttributeDto[]> {
  const own = await attributesRepository.listMappingsOrdered(category.id);
  if (own.length > 0) return own.map(toCategoryAttributeDto);

  const ancestors = category.path.split('/').filter((s) => s.length > 0);
  ancestors.pop(); // drop own id — ancestors only, root first
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestorId = ancestors[i];
    if (ancestorId === undefined) continue;
    const rows = await attributesRepository.listMappingsOrdered(ancestorId);
    if (rows.length > 0) return rows.map(toCategoryAttributeDto);
  }
  return [];
}

// ── public reads ────────────────────────────────────────────────────────────

/** Flat definition list (grouped client-side); `categoryCode` returns the effective mapped set instead. */
async function list(categoryCode?: string): Promise<AttributeDto[] | CategoryAttributeDto[]> {
  if (categoryCode === undefined) {
    const rows = await attributesRepository.list();
    return rows.map(toAttributeDto);
  }
  const category = await attributesRepository.findCategoryByCode(categoryCode);
  if (!category) throw notFound('Category not found');
  return effectiveMappingsForCategory(category);
}

async function byKey(key: string): Promise<AttributeDto> {
  const row = await attributesRepository.findByKey(key);
  if (!row) throw notFound('Attribute not found');
  return toAttributeDto(row);
}

// ── admin writes ────────────────────────────────────────────────────────────

async function create(actorId: string, input: CreateAttributeInput, ip: string | null): Promise<AttributeDto> {
  const row = await withTransaction(async (tx) => {
    if (await attributesRepository.findByKey(input.key, tx)) {
      throw conflict(`Attribute key '${input.key}' is already in use`);
    }
    const created = await attributesRepository.create(
      {
        key: input.key,
        label: input.label,
        labelHtml: blankToNull(input.labelHtml),
        groupName: input.groupName,
        type: input.type,
        unit: blankToNull(input.unit),
        enumValues: input.type === 'ENUM' ? (input.enumValues ?? []) : Prisma.DbNull,
      },
      tx,
    );
    await writeAudit(
      actorId,
      'attribute.create',
      'attribute',
      created.id,
      { key: created.key, type: created.type, groupName: created.groupName },
      ip,
      tx,
    );
    return created;
  });
  return toAttributeDto(row);
}

/**
 * PATCH — label/labelHtml/groupName/unit/enumValues and (guarded) type.
 * Changing the type once ProductAttributeValue rows reference the attribute
 * is rejected with 409 CONFLICT; without values it is allowed.
 */
async function update(actorId: string, id: string, input: UpdateAttributeInput, ip: string | null): Promise<AttributeDto> {
  const row = await withTransaction(async (tx) => {
    const current = await attributesRepository.findById(id, tx);
    if (!current) throw notFound('Attribute not found');

    const nextType = input.type ?? current.type;
    if (input.type !== undefined && input.type !== current.type) {
      const valueCount = await attributesRepository.countProductValues(id, tx);
      if (valueCount > 0) {
        throw conflict('Attribute type cannot be changed while product variant values reference it', { valueCount });
      }
    }

    // Effective enum list: explicit replacement > keep existing (ENUM→ENUM) > none.
    let nextEnum: string[] | null;
    if (input.enumValues !== undefined) {
      nextEnum = input.enumValues;
    } else {
      nextEnum = current.type === 'ENUM' && nextType === 'ENUM' ? normalizeEnumValues(current.enumValues) : null;
    }
    if (nextType === 'ENUM') {
      if (nextEnum === null || nextEnum.length === 0) {
        throw badRequest('enumValues must be a non-empty array when type is ENUM');
      }
      if (new Set(nextEnum).size !== nextEnum.length) {
        throw badRequest('enumValues must not contain duplicates');
      }
    } else {
      nextEnum = null;
    }

    const data: Prisma.AttributeDefinitionUncheckedUpdateInput = {};
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    const track = (field: string, from: unknown, to: unknown): void => {
      (data as Record<string, unknown>)[field] = to;
      diff[field] = { from, to };
    };

    if (input.label !== undefined && input.label !== current.label) track('label', current.label, input.label);
    if (input.labelHtml !== undefined) {
      const v = blankToNull(input.labelHtml);
      if (v !== current.labelHtml) track('labelHtml', current.labelHtml, v);
    }
    if (input.groupName !== undefined && input.groupName !== current.groupName) {
      track('groupName', current.groupName, input.groupName);
    }
    if (input.unit !== undefined) {
      const v = blankToNull(input.unit);
      if (v !== current.unit) track('unit', current.unit, v);
    }
    if (nextType !== current.type) track('type', current.type, nextType);
    const currentEnum = normalizeEnumValues(current.enumValues);
    if (JSON.stringify(nextEnum) !== JSON.stringify(currentEnum)) {
      // Prisma needs the DbNull sentinel (not JS null) for Json columns.
      track('enumValues', currentEnum, nextEnum === null ? Prisma.DbNull : nextEnum);
    }

    const updated =
      Object.keys(data).length > 0 ? await attributesRepository.updateById(id, data, tx) : current;
    await writeAudit(actorId, 'attribute.update', 'attribute', id, diff, ip, tx);
    return updated;
  });
  return toAttributeDto(row);
}

/** DELETE — hard delete, but 409 while categories or product values reference it. */
async function remove(actorId: string, id: string, ip: string | null): Promise<void> {
  await withTransaction(async (tx) => {
    const current = await attributesRepository.findById(id, tx);
    if (!current) throw notFound('Attribute not found');
    const [mappings, values] = await Promise.all([
      attributesRepository.countCategoryMappings(id, tx),
      attributesRepository.countProductValues(id, tx),
    ]);
    if (mappings > 0 || values > 0) {
      throw conflict('Attribute is still referenced by categories or product variant values', { mappings, values });
    }
    await attributesRepository.deleteById(id, tx);
    await writeAudit(actorId, 'attribute.delete', 'attribute', id, { key: current.key }, ip, tx);
  });
}

/**
 * PUT /admin/categories/:id/attributes — REPLACES the category's mapping in
 * one transaction (deleteMany + createMany). isVariantAxis requires STRING or
 * ENUM attributes (400 otherwise). Invalidates the navigation cache and
 * enqueues the counts refresh (consistent post-write hook).
 */
async function replaceMapping(
  actorId: string,
  categoryId: string,
  items: CategoryMappingInput,
  ip: string | null,
): Promise<CategoryAttributeDto[]> {
  const rows = await withTransaction(async (tx) => {
    const category = await attributesRepository.findCategoryById(categoryId, tx);
    if (!category || category.deletedAt !== null) throw notFound('Category not found');

    const ids = items.map((item) => item.attributeId);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      throw badRequest('Duplicate attributeIds in mapping');
    }
    const attributes = await attributesRepository.findManyByIds([...uniqueIds], tx);
    if (attributes.length !== uniqueIds.size) {
      const known = new Set(attributes.map((a) => a.id));
      throw badRequest('Unknown attributeIds in mapping', { unknown: ids.filter((i) => !known.has(i)) });
    }
    const byId = new Map(attributes.map((a) => [a.id, a]));
    for (const item of items) {
      const attr = byId.get(item.attributeId);
      if (item.isVariantAxis && attr !== undefined && attr.type !== 'STRING' && attr.type !== 'ENUM') {
        throw badRequest(
          `Attribute '${attr.key}' (${attr.type}) cannot be a variant axis — only STRING or ENUM attributes can`,
        );
      }
    }

    const rowsData: NewCategoryAttributeRow[] = items.map((item) => ({
      attributeId: item.attributeId,
      isRequired: item.isRequired,
      isFilterable: item.isFilterable,
      isVariantAxis: item.isVariantAxis,
      filterWidget: item.filterWidget,
      sortOrder: item.sortOrder,
    }));
    await attributesRepository.replaceCategoryMapping(categoryId, rowsData, tx);
    await writeAudit(
      actorId,
      'category.mapping.replace',
      'categoryAttribute',
      categoryId,
      { attributeIds: ids },
      ip,
      tx,
    );
    return attributesRepository.listMappingsOrdered(categoryId, tx);
  });
  afterCatalogWrite();
  return rows.map(toCategoryAttributeDto);
}

export const attributesService = {
  list,
  byKey,
  effectiveMappingsForCategory,
  create,
  update,
  remove,
  replaceMapping,
};
