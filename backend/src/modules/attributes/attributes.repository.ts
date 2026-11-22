// Attributes repository — attribute definitions, category→attribute mapping
// rows and the minimal category reads the mapping/inheritance logic needs.
import type { AttributeDefinition, Category, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { Transaction } from '../../db/transaction-types.js';

export type AttributeRow = AttributeDefinition;

const mappingInclude = { attribute: true } satisfies Prisma.CategoryAttributeInclude;

/** A mapping row joined with its attribute definition. */
export type CategoryAttributeWithAttribute = Prisma.CategoryAttributeGetPayload<{
  include: typeof mappingInclude;
}>;

/** Row shape accepted by the mapping replace (complementing the composite PK). */
export type NewCategoryAttributeRow = Omit<Prisma.CategoryAttributeUncheckedCreateInput, 'categoryId'>;

function db(tx?: Transaction): Transaction {
  return tx ?? prisma;
}

export const attributesRepository = {
  // ── attribute definitions ───────────────────────────────────────────────

  list(tx?: Transaction): Promise<AttributeRow[]> {
    return db(tx).attributeDefinition.findMany({
      orderBy: [{ groupName: 'asc' }, { label: 'asc' }, { key: 'asc' }],
    });
  },

  findByKey(key: string, tx?: Transaction): Promise<AttributeRow | null> {
    return db(tx).attributeDefinition.findUnique({ where: { key } });
  },

  findById(id: string, tx?: Transaction): Promise<AttributeRow | null> {
    return db(tx).attributeDefinition.findUnique({ where: { id } });
  },

  findManyByIds(ids: string[], tx?: Transaction): Promise<AttributeRow[]> {
    return db(tx).attributeDefinition.findMany({ where: { id: { in: ids } } });
  },

  create(data: Prisma.AttributeDefinitionUncheckedCreateInput, tx?: Transaction): Promise<AttributeRow> {
    return db(tx).attributeDefinition.create({ data });
  },

  updateById(id: string, data: Prisma.AttributeDefinitionUncheckedUpdateInput, tx?: Transaction): Promise<AttributeRow> {
    return db(tx).attributeDefinition.update({ where: { id }, data });
  },

  deleteById(id: string, tx?: Transaction): Promise<unknown> {
    return db(tx).attributeDefinition.delete({ where: { id } });
  },

  /** CategoryAttribute rows referencing the attribute (delete guard). */
  countCategoryMappings(attributeId: string, tx?: Transaction): Promise<number> {
    return db(tx).categoryAttribute.count({ where: { attributeId } });
  },

  /** ProductAttributeValue rows referencing the attribute (type-change guard). */
  countProductValues(attributeId: string, tx?: Transaction): Promise<number> {
    return db(tx).productAttributeValue.count({ where: { attributeId } });
  },

  // ── category mapping ────────────────────────────────────────────────────

  /** Mapping of one category ordered for display (filters endpoint, mapping UI). */
  listMappingsOrdered(categoryId: string, tx?: Transaction): Promise<CategoryAttributeWithAttribute[]> {
    return db(tx).categoryAttribute.findMany({
      where: { categoryId },
      include: mappingInclude,
      orderBy: [{ sortOrder: 'asc' }, { attribute: { key: 'asc' } }],
    });
  },

  /** REPLACES the category's mapping atomically (deleteMany + createMany). */
  async replaceCategoryMapping(
    categoryId: string,
    items: NewCategoryAttributeRow[],
    tx?: Transaction,
  ): Promise<number> {
    await db(tx).categoryAttribute.deleteMany({ where: { categoryId } });
    const res = await db(tx).categoryAttribute.createMany({
      data: items.map((item) => ({ ...item, categoryId })),
    });
    return res.count;
  },

  // ── category reads (mapping target + inheritance walk) ──────────────────

  findCategoryByCode(code: string, tx?: Transaction): Promise<Category | null> {
    return db(tx).category.findFirst({ where: { code, isActive: true, deletedAt: null } });
  },

  findCategoryById(id: string, tx?: Transaction): Promise<Category | null> {
    return db(tx).category.findUnique({ where: { id } });
  },
};
