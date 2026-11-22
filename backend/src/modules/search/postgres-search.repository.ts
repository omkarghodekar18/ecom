// Postgres search repository — the ONLY raw SQL in the search module:
// ranked text matching over the trigger-maintained, weighted Product
// searchVector (name A, brand + article numbers B, description C — migration
// 20261121040001) with pg_trgm typo tolerance, plus the suggest lookups.
// Every query is a parameterised prisma.$queryRaw tagged template; LIKE
// wildcards in user input are escaped, never concatenated.
//
// Ranking (spec 12, additive tiers so a product can score in several):
//   tier 0 (+3) articleNo ILIKE 'q%' or exact EAN match      — ranked first
//   tier 1 (+2) searchVector @@ websearch_to_tsquery(unaccent(q)), ts_rank
//   tier 2 (+1) trigram on the name (similarity > 0.3 / word_similarity > 0.5)
// Ties break on ts_rank, then trigram similarity, then id (stable).
import { prisma } from '../../db/prisma.js';

/** ILIKE pattern escaping: \, % and _ must not act as wildcards in user input. */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** One ranked match row (ordered best-first by the query itself). */
export interface ProductMatchRow {
  id: string;
  score: number;
  rank: number | null;
  sim: number;
  /** ArticleNo of an EXACT public match for q (article or EAN); else null. */
  exactArticleNo: string | null;
}

export interface SuggestedProductRow {
  slug: string;
  name: string;
  articleNo: string | null;
  imagePublicId: string | null;
  brandName: string;
}

export interface SuggestedCategoryRow {
  name: string;
  pathSlugs: string;
  code: string;
}

export interface SuggestedBrandRow {
  slug: string;
  name: string;
}

export const searchRepository = {
  /**
   * Best-first ranked text match over PUBLISHED, non-deleted products
   * (visibility ONLY — listing filters are applied by the engine through the
   * products module, so their semantics stay identical). `limit` caps the
   * candidate scope (Meilisearch-style maxTotalHits).
   */
  matchProductIds(q: string, limit: number): Promise<ProductMatchRow[]> {
    const prefix = `${escapeLike(q)}%`;
    const exact = escapeLike(q);
    return prisma.$queryRaw<ProductMatchRow[]>`
      SELECT
        p."id" AS "id",
        (
          (CASE WHEN EXISTS (
              SELECT 1 FROM "Variant" va
              WHERE va."productId" = p."id" AND va."deletedAt" IS NULL AND va."isActive"
                AND (va."articleNo" ILIKE ${prefix} OR va."ean" = ${q})
            ) THEN 3 ELSE 0 END)
          + (CASE WHEN p."searchVector" @@ websearch_to_tsquery('english', toolhub_unaccent(${q})) THEN 2 ELSE 0 END)
          + (CASE WHEN similarity(p."name", ${q}) > 0.3
                  OR word_similarity(${q}, p."name") > 0.5
                  OR word_similarity(p."name", ${q}) > 0.5
            THEN 1 ELSE 0 END)
        ) AS "score",
        ts_rank(p."searchVector", websearch_to_tsquery('english', toolhub_unaccent(${q}))) AS "rank",
        GREATEST(
          similarity(p."name", ${q}),
          word_similarity(${q}, p."name"),
          word_similarity(p."name", ${q})
        ) AS "sim",
        exact_match."articleNo" AS "exactArticleNo"
      FROM "Product" p
      LEFT JOIN LATERAL (
        SELECT v."articleNo" AS "articleNo"
        FROM "Variant" v
        WHERE v."productId" = p."id" AND v."deletedAt" IS NULL AND v."isActive"
          AND (v."articleNo" ILIKE ${exact} OR v."ean" = ${q})
        ORDER BY v."sortOrder" ASC, v."articleNo" ASC
        LIMIT 1
      ) exact_match ON TRUE
      WHERE p."deletedAt" IS NULL
        AND p."status" = 'PUBLISHED'
        AND (
          EXISTS (
            SELECT 1 FROM "Variant" vt
            WHERE vt."productId" = p."id" AND vt."deletedAt" IS NULL AND vt."isActive"
              AND (vt."articleNo" ILIKE ${prefix} OR vt."ean" = ${q})
          )
          OR p."searchVector" @@ websearch_to_tsquery('english', toolhub_unaccent(${q}))
          OR similarity(p."name", ${q}) > 0.3
          OR word_similarity(${q}, p."name") > 0.5
          OR word_similarity(p."name", ${q}) > 0.5
        )
      ORDER BY "score" DESC, "rank" DESC NULLS LAST, "sim" DESC, p."id" ASC
      LIMIT ${limit}::int`;
  },

  /**
   * Autocomplete products (visibility + articleNo/EAN, FTS or trigram on the
   * name): exact articleNo/EAN matches rank first, then FTS rank, then
   * trigram similarity. articleNo prefers the exact-matched variant.
   */
  suggestProducts(q: string, limit: number): Promise<SuggestedProductRow[]> {
    const prefix = `${escapeLike(q)}%`;
    const exact = escapeLike(q);
    return prisma.$queryRaw<SuggestedProductRow[]>`
      SELECT
        p."slug" AS "slug",
        p."name" AS "name",
        b."name" AS "brandName",
        COALESCE(
          (SELECT v."articleNo" FROM "Variant" v
            WHERE v."productId" = p."id" AND v."deletedAt" IS NULL AND v."isActive"
              AND (v."articleNo" ILIKE ${exact} OR v."ean" = ${q})
            ORDER BY v."sortOrder" ASC, v."articleNo" ASC LIMIT 1),
          (SELECT v2."articleNo" FROM "Variant" v2
            WHERE v2."productId" = p."id" AND v2."deletedAt" IS NULL AND v2."isActive"
            ORDER BY v2."sortOrder" ASC, v2."articleNo" ASC LIMIT 1)
        ) AS "articleNo",
        (SELECT i."publicId" FROM "ProductImage" i
          WHERE i."productId" = p."id"
          ORDER BY i."sortOrder" ASC, i."id" ASC LIMIT 1) AS "imagePublicId",
        (CASE WHEN EXISTS (
            SELECT 1 FROM "Variant" vs
            WHERE vs."productId" = p."id" AND vs."deletedAt" IS NULL AND vs."isActive"
              AND (vs."articleNo" ILIKE ${prefix} OR vs."ean" = ${q})
          ) THEN 1 ELSE 0 END) AS "tier0",
        ts_rank(p."searchVector", websearch_to_tsquery('english', toolhub_unaccent(${q}))) AS "rank",
        GREATEST(similarity(p."name", ${q}), word_similarity(${q}, p."name")) AS "sim"
      FROM "Product" p
      JOIN "Brand" b ON b."id" = p."brandId"
      WHERE p."deletedAt" IS NULL
        AND p."status" = 'PUBLISHED'
        AND (
          EXISTS (
            SELECT 1 FROM "Variant" vs2
            WHERE vs2."productId" = p."id" AND vs2."deletedAt" IS NULL AND vs2."isActive"
              AND (vs2."articleNo" ILIKE ${prefix} OR vs2."ean" = ${q})
          )
          OR p."searchVector" @@ websearch_to_tsquery('english', toolhub_unaccent(${q}))
          OR similarity(p."name", ${q}) > 0.3
          OR word_similarity(${q}, p."name") > 0.5
        )
      ORDER BY "tier0" DESC, "rank" DESC NULLS LAST, "sim" DESC, p."id" ASC
      LIMIT ${limit}::int`;
  },

  /** Autocomplete categories: name/pathSlugs substring, active only, productCount desc. */
  suggestCategories(q: string, limit: number): Promise<SuggestedCategoryRow[]> {
    const contains = `%${escapeLike(q)}%`;
    return prisma.$queryRaw<SuggestedCategoryRow[]>`
      SELECT c."name" AS "name", c."pathSlugs" AS "pathSlugs", c."code" AS "code"
      FROM "Category" c
      WHERE c."deletedAt" IS NULL AND c."isActive"
        AND (c."name" ILIKE ${contains} OR c."pathSlugs" ILIKE ${contains})
      ORDER BY c."productCount" DESC, c."level" ASC, c."name" ASC
      LIMIT ${limit}::int`;
  },

  /** Autocomplete brands: name substring, alphabetical. */
  suggestBrands(q: string, limit: number): Promise<SuggestedBrandRow[]> {
    const contains = `%${escapeLike(q)}%`;
    return prisma.$queryRaw<SuggestedBrandRow[]>`
      SELECT b."slug" AS "slug", b."name" AS "name"
      FROM "Brand" b
      WHERE b."name" ILIKE ${contains}
      ORDER BY b."name" ASC
      LIMIT ${limit}::int`;
  },
};
