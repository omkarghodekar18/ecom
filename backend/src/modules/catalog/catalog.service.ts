// Catalog service — public category reads (navigation, detail, breadcrumb,
// filters) plus admin tree writes (create/update/reorder/move/soft-delete)
// and the subtree product-count recomputation job. Path invariants:
//   path      = "/" + id of every ancestor + own id, trailing slash per level
//   pathSlugs = slugs joined with "/" (no leading/trailing slash)
//   level     = 1 for roots, parent.level + 1 below
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { badRequest, conflict, notFound } from '../../common/errors/app-error.js';
import { slugify } from '../../common/utils/slug.util.js';
import { withTransaction } from '../../db/transaction.js';
import type { Transaction } from '../../db/transaction-types.js';
import { writeAudit } from '../../services/audit/index.js';
import { cache } from '../../services/cache/index.js';
import type {
  BrandDto,
  CategoryAttributeDto,
  CategoryDto,
  CrumbDto,
  NavigationNodeDto,
} from '../../shared/dto/catalog.dto.js';
import { attributesService } from '../attributes/attributes.service.js';
import { catalogRepository, type CategoryRow } from './catalog.repository.js';
import { afterCatalogWrite } from './catalog.queue.js';
import { iconUrl, mediaUrl } from './public-id.util.js';

// ── input contracts (shared/dto is frozen; module-owned schemas live here) ──

/** Category codes are hierarchical digit pairs: "10", "10-05", "10-05-03", … */
const CATEGORY_CODE_PATTERN = /^\d{2}(-\d{2})*$/;

export const CreateCategoryInputSchema = z.object({
  parentId: z.string().min(1).nullable().default(null),
  code: z.string().regex(CATEGORY_CODE_PATTERN, {
    message: 'code must be NN-NN… segments of exactly 2 digits (e.g. 10-05-03)',
  }),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(140).optional(),
  description: z.string().max(5000).optional().nullable(),
  seoTitle: z.string().max(300).optional().nullable(),
  seoDescription: z.string().max(500).optional().nullable(),
  sortOrder: z.number().int().default(0),
  imagePublicId: z.string().max(200).optional().nullable(),
  iconPublicId: z.string().max(200).optional().nullable(),
});
export type CreateCategoryInput = z.infer<typeof CreateCategoryInputSchema>;

/** Reparenting is NOT patchable — use PATCH /admin/categories/move. */
export const UpdateCategoryInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(140).optional(),
  description: z.string().max(5000).optional().nullable(),
  seoTitle: z.string().max(300).optional().nullable(),
  seoDescription: z.string().max(500).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  imagePublicId: z.string().max(200).optional().nullable(),
  iconPublicId: z.string().max(200).optional().nullable(),
});
export type UpdateCategoryInput = z.infer<typeof UpdateCategoryInputSchema>;

export const MoveCategoryInputSchema = z.object({
  id: z.string().min(1),
  newParentId: z.string().min(1).nullable(),
  sortOrder: z.number().int().optional(),
});
export type MoveCategoryInput = z.infer<typeof MoveCategoryInputSchema>;

/** Body is the bare ordered array of sibling rows to re-sort. */
export const ReorderCategoryInputSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      parentId: z.string().min(1).nullable().optional(),
      sortOrder: z.number().int(),
    }),
  )
  .min(1);
export type ReorderCategoryInput = z.infer<typeof ReorderCategoryInputSchema>;

// ── DTO mapping ─────────────────────────────────────────────────────────────

const NAVIGATION_CACHE_TTL_MS = 5 * 60_000;

/** Public detail response: CategoryDto + materialised path + immediate children. */
export type CategoryDetailDto = CategoryDto & { path: string; children: CategoryDto[] };

/** Brand row extended for subtree listings (products module). */
export type BrandWithCountDto = BrandDto & { productCount: number };

function toCategoryDto(row: CategoryRow): CategoryDto {
  return {
    id: row.id,
    code: row.code,
    slug: row.slug,
    name: row.name,
    description: row.description,
    pathSlugs: row.pathSlugs,
    level: row.level,
    productCount: row.productCount,
    isActive: row.isActive,
    image: mediaUrl(row.imagePublicId),
    icon: iconUrl(row.iconPublicId),
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
  };
}

/** Optional text fields may arrive as "" — store NULL instead. */
function blankToNull(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === '' ? null : value;
}

async function mustFindActiveByCode(code: string, tx?: Transaction): Promise<CategoryRow> {
  const row = await catalogRepository.findActiveByCode(code, tx);
  if (!row) throw notFound('Category not found');
  return row;
}

async function mustFindCategory(id: string, tx?: Transaction): Promise<CategoryRow> {
  const row = await catalogRepository.findById(id, tx);
  if (!row || row.deletedAt !== null) throw notFound('Category not found');
  return row;
}

/** Slug + "-2", "-3"… until free (global uniqueness, app-enforced). */
async function uniqueCategorySlug(base: string, excludeId: string | null, tx: Transaction): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (await catalogRepository.slugTaken(candidate, excludeId, tx)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
    if (suffix > 50) throw conflict(`Could not derive a unique slug for '${base}'`);
  }
  return candidate;
}

// ── public reads ────────────────────────────────────────────────────────────

/** Active-only navigation tree, `depth` levels deep, cached 5 min. */
async function navigationTree(depth: number): Promise<NavigationNodeDto[]> {
  return cache.wrap(`navigation:tree:${depth}`, NAVIGATION_CACHE_TTL_MS, async () => {
    const rows = await catalogRepository.listActiveUpToLevel(depth);
    const nodes = new Map<string, NavigationNodeDto>();
    for (const row of rows) {
      nodes.set(row.id, {
        id: row.id,
        code: row.code,
        slug: row.slug,
        name: row.name,
        level: row.level,
        productCount: row.productCount,
        icon: iconUrl(row.iconPublicId),
        children: [],
      });
    }
    const roots: NavigationNodeDto[] = [];
    // rows are level-ascending, so every parent node exists before its children.
    for (const row of rows) {
      const node = nodes.get(row.id);
      if (!node) continue;
      const parent = row.parentId !== null ? nodes.get(row.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  });
}

/** Category detail incl. immediate active children (spec 15.2). */
async function categoryByCode(code: string): Promise<CategoryDetailDto> {
  const row = await mustFindActiveByCode(code);
  const children = await catalogRepository.listActiveChildren(row.id);
  return { ...toCategoryDto(row), path: row.path, children: children.map(toCategoryDto) };
}

/** Immediate active children only. */
async function children(code: string): Promise<CategoryDto[]> {
  const row = await mustFindActiveByCode(code);
  const kids = await catalogRepository.listActiveChildren(row.id);
  return kids.map(toCategoryDto);
}

/**
 * Filter set for a category (spec 15.3): the category's OWN CategoryAttribute
 * mapping; when empty, the nearest ancestor's mapping up the path. Ordered by
 * sortOrder. Delegates to the attributes module, which owns the mapping domain.
 */
async function filters(code: string): Promise<CategoryAttributeDto[]> {
  const row = await mustFindActiveByCode(code);
  return attributesService.effectiveMappingsForCategory(row);
}

/** Breadcrumb chain root → this category. */
async function breadcrumb(code: string): Promise<CrumbDto[]> {
  const row = await mustFindActiveByCode(code);
  const ids = row.path.split('/').filter((s) => s.length > 0);
  const rows = await catalogRepository.findManyByIds(ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const crumbs: CrumbDto[] = [];
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) continue;
    crumbs.push({ name: c.name, slug: c.slug, code: c.code, pathSlugs: c.pathSlugs });
  }
  return crumbs;
}

/**
 * Brands selling inside a category subtree (products-module facet feed).
 * Unrouted for now — exported for the listing phase.
 */
async function brandsForCategory(code: string): Promise<BrandWithCountDto[]> {
  const row = await mustFindActiveByCode(code);
  const brands = await catalogRepository.listBrandsForSubtree(row);
  return brands.map((b) => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    isPremium: b.isPremium,
    logo: mediaUrl(b.logoPublicId),
    description: b.description,
    productCount: b.productCount,
  }));
}

// ── subtree product counts (queue job) ─────────────────────────────────────

/**
 * Recomputes every active category's `productCount` (PUBLISHED, non-deleted
 * products across the whole subtree) in ONE SQL statement: a recursive CTE
 * enumerates (ancestor, node) pairs over the materialised path, counts the
 * eligible products per root, then UPDATEs the denormalised column.
 * Soft-deleted or inactive categories never contribute (recursion stops there).
 */
export async function refreshCategoryProductCounts(): Promise<number> {
  return prisma.$executeRaw`
    WITH RECURSIVE subtree(anc_id, node_id) AS (
      SELECT id, id FROM "Category" WHERE "deletedAt" IS NULL AND "isActive" = true
      UNION ALL
      SELECT s.anc_id, c.id
      FROM subtree s
      JOIN "Category" c ON c."parentId" = s.node_id
      WHERE c."deletedAt" IS NULL AND c."isActive" = true
    ),
    counts AS (
      SELECT s.anc_id AS id, COUNT(p.id)::int AS n
      FROM subtree s
      LEFT JOIN "Product" p
        ON p."categoryId" = s.node_id
       AND p."deletedAt" IS NULL
       AND p.status = 'PUBLISHED'
      GROUP BY s.anc_id
    )
    UPDATE "Category" AS c
    SET "productCount" = counts.n
    FROM counts
    WHERE c.id = counts.id`;
}

// ── admin writes ────────────────────────────────────────────────────────────

/** POST /admin/categories — creates a child (or root) with computed path fields. */
async function createCategory(
  actorId: string,
  input: CreateCategoryInput,
  ip: string | null,
): Promise<CategoryDetailDto> {
  const row = await withTransaction(async (tx) => {
    let parent: CategoryRow | null = null;
    if (input.parentId !== null) {
      parent = await catalogRepository.findById(input.parentId, tx);
      if (!parent || parent.deletedAt !== null) throw notFound('Parent category not found');
    }
    if (await catalogRepository.findByCode(input.code, tx)) {
      throw conflict(`Category code ${input.code} is already in use`);
    }
    const slug = await uniqueCategorySlug(slugify(input.slug?.trim() || input.name) || 'category', null, tx);
    const level = parent !== null ? parent.level + 1 : 1;
    // path needs the DB-generated id, so insert then patch inside the same tx.
    const created = await catalogRepository.create(
      {
        code: input.code,
        name: input.name,
        slug,
        parentId: parent?.id ?? null,
        description: blankToNull(input.description),
        seoTitle: blankToNull(input.seoTitle),
        seoDescription: blankToNull(input.seoDescription),
        sortOrder: input.sortOrder,
        imagePublicId: blankToNull(input.imagePublicId),
        iconPublicId: blankToNull(input.iconPublicId),
        path: '',
        pathSlugs: '',
        level,
      },
      tx,
    );
    const path = `${parent !== null ? parent.path : '/'}${created.id}/`;
    const pathSlugs = parent !== null ? `${parent.pathSlugs}/${slug}` : slug;
    const updated = await catalogRepository.updateById(created.id, { path, pathSlugs }, tx);
    await writeAudit(
      actorId,
      'category.create',
      'category',
      created.id,
      { code: input.code, name: input.name, slug, parentId: parent?.id ?? null },
      ip,
      tx,
    );
    return updated;
  });
  afterCatalogWrite();
  const children = await catalogRepository.listActiveChildren(row.id);
  return { ...toCategoryDto(row), path: row.path, children: children.map(toCategoryDto) };
}

/**
 * PATCH /admin/categories/:id — partial update. A slug change rewrites the
 * pathSlugs of the category AND all descendants, and inserts CATEGORY
 * SlugRedirect rows (old→new) for every affected path in the same transaction.
 */
async function updateCategory(
  actorId: string,
  id: string,
  input: UpdateCategoryInput,
  ip: string | null,
): Promise<CategoryDetailDto> {
  const row = await withTransaction(async (tx) => {
    const current = await mustFindCategory(id, tx);
    const data: Prisma.CategoryUncheckedUpdateInput = {};
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    const track = (field: string, from: unknown, to: unknown): void => {
      (data as Record<string, unknown>)[field] = to;
      diff[field] = { from, to };
    };

    if (input.name !== undefined && input.name !== current.name) track('name', current.name, input.name);
    if (input.description !== undefined) {
      const v = blankToNull(input.description);
      if (v !== current.description) track('description', current.description, v);
    }
    if (input.seoTitle !== undefined) {
      const v = blankToNull(input.seoTitle);
      if (v !== current.seoTitle) track('seoTitle', current.seoTitle, v);
    }
    if (input.seoDescription !== undefined) {
      const v = blankToNull(input.seoDescription);
      if (v !== current.seoDescription) track('seoDescription', current.seoDescription, v);
    }
    if (input.imagePublicId !== undefined) {
      const v = blankToNull(input.imagePublicId);
      if (v !== current.imagePublicId) track('imagePublicId', current.imagePublicId, v);
    }
    if (input.iconPublicId !== undefined) {
      const v = blankToNull(input.iconPublicId);
      if (v !== current.iconPublicId) track('iconPublicId', current.iconPublicId, v);
    }
    if (input.sortOrder !== undefined && input.sortOrder !== current.sortOrder) {
      track('sortOrder', current.sortOrder, input.sortOrder);
    }
    if (input.isActive !== undefined && input.isActive !== current.isActive) {
      track('isActive', current.isActive, input.isActive);
    }

    if (input.slug !== undefined && input.slug !== current.slug) {
      const slug = await uniqueCategorySlug(slugify(input.slug) || 'category', id, tx);
      if (slug !== current.slug) {
        track('slug', current.slug, slug);
        const subtree = await catalogRepository.listSubtree(current, tx);
        for (const member of subtree) {
          const nextSlugs = `${slug}${member.pathSlugs.slice(current.pathSlugs.length)}`;
          if (nextSlugs === member.pathSlugs) continue;
          await catalogRepository.updateById(member.id, { pathSlugs: nextSlugs }, tx);
          await catalogRepository.upsertSlugRedirect(member.pathSlugs, nextSlugs, tx);
        }
      }
    }

    const updated = Object.keys(data).length > 0 ? await catalogRepository.updateById(id, data, tx) : current;
    await writeAudit(actorId, 'category.update', 'category', id, diff, ip, tx);
    return updated;
  });
  afterCatalogWrite();
  const children = await catalogRepository.listActiveChildren(row.id);
  return { ...toCategoryDto(row), path: row.path, children: children.map(toCategoryDto) };
}

/**
 * PATCH /admin/categories/reorder — applies sibling sortOrders in one
 * transaction. `parentId` is accepted as a guard: it must match the current
 * parent; reparenting is the move endpoint's job.
 */
async function reorderCategories(actorId: string, items: ReorderCategoryInput, ip: string | null): Promise<void> {
  await withTransaction(async (tx) => {
    for (const item of items) {
      const cat = await mustFindCategory(item.id, tx);
      if (item.parentId !== undefined && item.parentId !== cat.parentId) {
        throw badRequest(
          `Category ${cat.code} has a different parent — use PATCH /admin/categories/move to reparent`,
        );
      }
      if (item.sortOrder !== cat.sortOrder) {
        await catalogRepository.updateById(item.id, { sortOrder: item.sortOrder }, tx);
      }
    }
    await writeAudit(actorId, 'category.reorder', 'category', null, { items }, ip, tx);
  });
  afterCatalogWrite();
}

/**
 * PATCH /admin/categories/move — re-parents a category, recomputing
 * path/pathSlugs/level for the whole moved subtree atomically. Moving under
 * the category itself or any of its descendants is rejected with 400
 * VALIDATION_ERROR. Slug redirects are written for every path that changed.
 */
async function moveCategory(
  actorId: string,
  input: MoveCategoryInput,
  ip: string | null,
): Promise<CategoryDetailDto> {
  const row = await withTransaction(async (tx) => {
    const cat = await mustFindCategory(input.id, tx);
    let parent: CategoryRow | null = null;
    if (input.newParentId !== null) {
      parent = await catalogRepository.findById(input.newParentId, tx);
      if (!parent || parent.deletedAt !== null) throw notFound('New parent category not found');
      if (parent.id === cat.id || parent.path.startsWith(cat.path)) {
        throw badRequest('A category cannot be moved under itself or one of its descendants');
      }
    }
    const subtree = await catalogRepository.listSubtree(cat, tx); // incl. self
    const pathBase = parent !== null ? parent.path : '/';
    const newPathPrefix = `${pathBase}${cat.id}/`;
    const newSlugPrefix = parent !== null ? `${parent.pathSlugs}/${cat.slug}` : cat.slug;
    const levelShift = (parent !== null ? parent.level + 1 : 1) - cat.level;
    for (const member of subtree) {
      const nextPath = `${newPathPrefix}${member.path.slice(cat.path.length)}`;
      const nextSlugs = `${newSlugPrefix}${member.pathSlugs.slice(cat.pathSlugs.length)}`;
      const nextLevel = member.level + levelShift;
      await catalogRepository.updateById(
        member.id,
        { path: nextPath, pathSlugs: nextSlugs, level: nextLevel },
        tx,
      );
      if (nextSlugs !== member.pathSlugs) {
        await catalogRepository.upsertSlugRedirect(member.pathSlugs, nextSlugs, tx);
      }
    }
    const moved = await catalogRepository.updateById(
      cat.id,
      { parentId: parent?.id ?? null, ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}) },
      tx,
    );
    await writeAudit(
      actorId,
      'category.move',
      'category',
      cat.id,
      { from: cat.pathSlugs, to: moved.pathSlugs, newParentId: parent?.id ?? null },
      ip,
      tx,
    );
    return moved;
  });
  afterCatalogWrite();
  const children = await catalogRepository.listActiveChildren(row.id);
  return { ...toCategoryDto(row), path: row.path, children: children.map(toCategoryDto) };
}

/**
 * DELETE /admin/categories/:id — soft delete, only when the category has no
 * non-deleted products and no non-deleted children; otherwise 409 CONFLICT
 * with `{ products, children }` details.
 */
async function deleteCategory(actorId: string, id: string, ip: string | null): Promise<void> {
  await withTransaction(async (tx) => {
    const cat = await mustFindCategory(id, tx);
    const [products, children] = await Promise.all([
      catalogRepository.countActiveProducts(id, tx),
      catalogRepository.countLiveChildren(id, tx),
    ]);
    if (products > 0 || children > 0) {
      throw conflict('Category still has products or child categories', { products, children });
    }
    await catalogRepository.updateById(id, { deletedAt: new Date() }, tx);
    await writeAudit(actorId, 'category.delete', 'category', id, { code: cat.code, name: cat.name }, ip, tx);
  });
  afterCatalogWrite();
}

export const catalogService = {
  navigationTree,
  categoryByCode,
  children,
  filters,
  breadcrumb,
  brandsForCategory,
  refreshCategoryProductCounts,
  createCategory,
  updateCategory,
  reorderCategories,
  moveCategory,
  deleteCategory,
};
