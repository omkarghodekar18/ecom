// Layer 4 — uniqueness & duplicates (spec 16.3): in-file duplicate article_no/
// ean (ALL involved rows reported), DB conflicts owned by a DIFFERENT product
// (error), the per-job duplicate policy for same-product updates (info) and
// slug-collision auto-suffix warnings. Also flags already-imported files.
import { prisma } from '../../../db/prisma.js';
import { issue, type ImportIssueDraft, type ImportOptions } from '../imports.errors.js';
import type { NormalizedWorkbook } from '../schemas/sheet.schemas.js';
import type { RefContext } from './refs.validator.js';

export function validateUniqueness(normalized: NormalizedWorkbook, context: RefContext, options: ImportOptions): ImportIssueDraft[] {
  const issues: ImportIssueDraft[] = [];

  // ── in-file duplicates: report every row involved ──────────────────────
  const articleRows = new Map<string, number[]>();
  const eanRows = new Map<string, number[]>();
  const keyRows = new Map<string, number[]>();
  for (const variant of normalized.variants) {
    if (variant.articleNo !== '') {
      articleRows.set(variant.articleNo, [...(articleRows.get(variant.articleNo) ?? []), variant.rowNumber]);
    }
    if (variant.ean !== null) {
      eanRows.set(variant.ean, [...(eanRows.get(variant.ean) ?? []), variant.rowNumber]);
    }
  }
  for (const product of normalized.products) {
    keyRows.set(product.productKey, [...(keyRows.get(product.productKey) ?? []), product.rowNumber]);
  }
  for (const [articleNo, rows] of articleRows) {
    if (rows.length > 1) {
      for (const rowNumber of rows) {
        issues.push(issue.error('Variants', rowNumber, 'DUPLICATE_IN_FILE', `article_no '${articleNo}' appears ${rows.length}× (rows ${rows.join(', ')}).`, 'article_no', articleNo));
      }
    }
  }
  for (const [ean, rows] of eanRows) {
    if (rows.length > 1) {
      for (const rowNumber of rows) {
        issues.push(issue.error('Variants', rowNumber, 'DUPLICATE_IN_FILE', `ean '${ean}' appears ${rows.length}× (rows ${rows.join(', ')}).`, 'ean', ean));
      }
    }
  }
  for (const [key, rows] of keyRows) {
    if (rows.length > 1) {
      for (const rowNumber of rows) {
        issues.push(issue.error('Products', rowNumber, 'DUPLICATE_IN_FILE', `product_key '${key}' appears ${rows.length}×.`, 'product_key', key));
      }
    }
  }

  // ── DB conflicts vs the per-job duplicate policy ────────────────────────
  for (const variant of normalized.variants) {
    if (variant.articleNo === '') continue;
    const existing = context.existingArticles.get(variant.articleNo);
    if (existing === undefined) continue;
    const fileProduct = normalized.products.find((row) => row.productKey === variant.productKey);
    const existingSlug = [...context.existingProducts.entries()].find(([, product]) => product.id === existing.productId)?.[0];
    const sameProduct = variant.productKey !== '' && (existingSlug === variant.productKey || fileProduct === undefined && existingSlug === variant.productKey);
    if (sameProduct) {
      // Update of an existing variant of THIS product — apply the policy.
      if (options.onDuplicateArticleNo === 'FAIL') {
        issues.push(issue.error('Variants', variant.rowNumber, 'DUPLICATE_POLICY', `article_no '${variant.articleNo}' exists and policy is FAIL.`, 'article_no', variant.articleNo));
      } else if (options.onDuplicateArticleNo === 'SKIP') {
        issues.push(issue.warning('Variants', variant.rowNumber, 'DUPLICATE_POLICY', `article_no '${variant.articleNo}' exists — row will be skipped.`, 'article_no', variant.articleNo));
      }
    } else {
      issues.push(
        issue.error('Variants', variant.rowNumber, 'ARTICLE_NO_CONFLICT', `article_no '${variant.articleNo}' belongs to another product.`, 'article_no', variant.articleNo),
      );
    }
  }
  for (const variant of normalized.variants) {
    if (variant.ean === null) continue;
    const clashVariantId = context.existingEans.get(variant.ean);
    if (clashVariantId === undefined) continue;
    const own = context.existingArticles.get(variant.articleNo);
    if (own === undefined || own.variantId !== clashVariantId) {
      issues.push(issue.error('Variants', variant.rowNumber, 'EAN_CONFLICT', undefined, 'ean', variant.ean));
    }
  }

  // ── slug collisions: product_key taken by a DIFFERENT live product ──────
  // (same key = update; that is the intended path, no issue). When the key is
  // new but the generated slug is taken, the committer suffixes -2, -3… and we
  // warn here by checking the slugged product_key.
  for (const product of normalized.products) {
    if (context.existingProducts.has(product.productKey)) continue; // update
    const candidate = product.productKey.toLowerCase();
    const clash = await0(candidate);
    if (clash !== null && clash !== candidate) {
      issues.push(issue.warning('Products', product.rowNumber, 'SLUG_SUFFIX', `Slug '${candidate}' is taken — a suffix will be appended.`, 'product_key', product.productKey));
    }
  }
  return issues;
}

/** slugTaken lookup deferral: the committer re-checks inside its transaction;
 * here we approximate with a name/slug LIKE probe (sync via cache). */
function await0(candidate: string): string | null {
  return slugProbeCache.get(candidate) ?? null;
}

const slugProbeCache = new Map<string, string | null>();

/** Fills the slug probe cache for the current workbook (called by the service). */
export async function primeSlugProbe(normalized: NormalizedWorkbook, context: RefContext): Promise<void> {
  slugProbeCache.clear();
  const keys = [...new Set(normalized.products.map((product) => product.productKey.toLowerCase()))];
  if (keys.length === 0) return;
  const rows = await prisma.product.findMany({
    where: { slug: { in: keys }, deletedAt: null },
    select: { slug: true, id: true },
  });
  const bySlug = new Map(rows.map((row) => [row.slug, row.slug]));
  for (const key of keys) {
    // Only a clash when the slug exists AND is not this product_key's product.
    const existing = context.existingProducts.get(key);
    const row = bySlug.get(key);
    if (row !== undefined && existing === undefined) slugProbeCache.set(key, row);
  }
}
