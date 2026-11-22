// Products mapper — Prisma rows → shared DTO shapes. Pure functions, no I/O:
// media URL resolution goes through the catalog module's public-id.util
// (`/media/{publicId}` until the real media URL builder ships).
//
// Availability rule (spec 15.x, shared by listings, PDP and the variant
// lookup): stockQty > 0 → green "In stock"; else leadTimeMinDays 1..n → amber
// "Lead time X(–Y) days"; else red "Not available". A family's listing
// availability is the one of its BEST variant (in-stock > lead-time > rest).
import type { Category, Prisma } from '@prisma/client';
import type { CategoryAttributeDto, CrumbDto } from '../../shared/dto/catalog.dto.js';
import type {
  AvailabilityDto,
  DocumentDto,
  ImageDto,
  ListingProductDto,
  ProductDetailDto,
  TechDataDto,
  VariantAttributes,
  VariantDto,
} from '../../shared/dto/product.dto.js';
import { mediaUrl } from '../catalog/public-id.util.js';
import type { CategoryRow } from '../catalog/catalog.repository.js';
import type {
  ImageLiteRow,
  ProductDetailRow,
  ProductListRow,
  VariantDetailRow,
  VariantLiteRow,
} from './products.repository.js';

// ── availability ────────────────────────────────────────────────────────────

/** Columns the availability rule reads. */
export interface AvailabilitySource {
  stockQty: number;
  leadTimeMinDays: number | null;
  leadTimeMaxDays: number | null;
}

/** Availability of ONE variant (see module header for the tone rule). */
export function availabilityOf(v: AvailabilitySource): AvailabilityDto {
  if (v.stockQty > 0) {
    return { tone: 'green', label: 'In stock', stockQty: v.stockQty, leadTimeMinDays: v.leadTimeMinDays, leadTimeMaxDays: v.leadTimeMaxDays };
  }
  if (v.leadTimeMinDays !== null && v.leadTimeMinDays >= 1) {
    const min = v.leadTimeMinDays;
    const max = v.leadTimeMaxDays;
    const label =
      max !== null && max !== min
        ? `Lead time ${min}\u2013${max} days`
        : `Lead time ${min} day${min === 1 ? '' : 's'}`;
    return { tone: 'amber', label, stockQty: v.stockQty, leadTimeMinDays: min, leadTimeMaxDays: max };
  }
  return { tone: 'red', label: 'Not available', stockQty: v.stockQty, leadTimeMinDays: v.leadTimeMinDays, leadTimeMaxDays: v.leadTimeMaxDays };
}

function toneRank(a: AvailabilityDto): number {
  return a.tone === 'green' ? 0 : a.tone === 'amber' ? 1 : 2;
}

/** Best availability across the given (active) variants, red when there are none. */
export function bestAvailability(variants: AvailabilitySource[]): AvailabilityDto {
  let best: AvailabilityDto | null = null;
  for (const v of variants) {
    const candidate = availabilityOf(v);
    if (best === null || toneRank(candidate) < toneRank(best)) best = candidate;
  }
  return (
    best ?? { tone: 'red', label: 'Not available', stockQty: 0, leadTimeMinDays: null, leadTimeMaxDays: null }
  );
}

// ── attribute values ────────────────────────────────────────────────────────

/** One stored attribute value joined with its definition. */
export interface AttributeValueRow {
  attributeId: string;
  attribute: { key: string; type: string };
  valueString: string | null;
  valueNumber: Prisma.Decimal | null;
  valueBool: boolean | null;
}

/** Stored value → the DTO union (NUMBER becomes a JS number). */
function typedValue(row: AttributeValueRow): string | number | boolean | null {
  switch (row.attribute.type) {
    case 'NUMBER':
      return row.valueNumber === null ? null : Number(row.valueNumber);
    case 'BOOLEAN':
      return row.valueBool;
    default:
      return row.valueString;
  }
}

/** Variant attribute rows → the flat `{ key: value }` map. */
export function attributesMap(rows: AttributeValueRow[]): VariantAttributes {
  const map: VariantAttributes = {};
  for (const row of rows) map[row.attribute.key] = typedValue(row);
  return map;
}

// ── listings ────────────────────────────────────────────────────────────────

/**
 * Listing row: priceFrom from the denormalised product.minPrice (2dp string),
 * firstArticleNo/variantCount/availability from the product's active variants
 * (best availability wins), image = first product image URL.
 */
export function toListingDto(
  product: ProductListRow,
  variants: VariantLiteRow[],
  image: ImageLiteRow | null,
): ListingProductDto {
  const first = variants[0];
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    brandName: product.brand.name,
    brandSlug: product.brand.slug,
    firstArticleNo: first !== undefined ? first.articleNo : '',
    firstVariantId: first !== undefined ? first.id : '',
    isBestseller: product.isBestseller,
    variantCount: variants.length,
    priceFrom: product.minPrice === null ? null : product.minPrice.toFixed(2),
    image: image === null ? null : mediaUrl(image.publicId),
    imageAlt: image === null ? null : image.alt,
    availability: bestAvailability(variants),
  };
}

// ── crumbs ──────────────────────────────────────────────────────────────────

/** Category chain root → this category, from the materialised path ids. */
export function toCrumbs(pathIds: string[], rows: CategoryRow[] | Category[]): CrumbDto[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const crumbs: CrumbDto[] = [];
  for (const id of pathIds) {
    const c = byId.get(id);
    if (!c) continue;
    crumbs.push({ name: c.name, slug: c.slug, code: c.code, pathSlugs: c.pathSlugs });
  }
  return crumbs;
}

// ── variants ────────────────────────────────────────────────────────────────

/**
 * Variant row shape `toVariantDto` consumes: VariantDetailRow minus the
 * `product` back-relation. The PDP detail include nests variants under the
 * product, so those rows carry no `product` — both row shapes are assignable.
 */
export type VariantDtoRow = Omit<VariantDetailRow, 'product'>;

/** Variant row (with values + tiers) → VariantDto. */
export function toVariantDto(variant: VariantDtoRow): VariantDto {
  return {
    id: variant.id,
    articleNo: variant.articleNo,
    ean: variant.ean,
    name: variant.name,
    listPrice: variant.listPrice.toFixed(2),
    currency: variant.currency,
    priceUnit: variant.priceUnit,
    unitLabel: variant.unitLabel,
    taxClass: variant.taxClass,
    stockQty: variant.stockQty,
    leadTimeMinDays: variant.leadTimeMinDays,
    leadTimeMaxDays: variant.leadTimeMaxDays,
    minOrderQty: variant.minOrderQty,
    packSize: variant.packSize,
    isActive: variant.isActive,
    priceTiers: variant.priceTiers.map((t) => ({ minQty: t.minQty, price: t.price.toFixed(2) })),
    attributes: attributesMap(variant.attributes),
    availability: availabilityOf(variant),
  };
}

// ── product detail ──────────────────────────────────────────────────────────

/**
 * PDP row → ProductDetailDto.
 *
 * `techData` = the category's effective attribute mapping (ordered) with the
 * value of the FIRST active variant that carries it — the SSR/SEO view of the
 * default variant; the client recomputes rows per selected variant from
 * `variant.attributes`.
 */
export function toDetailDto(
  product: ProductDetailRow,
  mappings: CategoryAttributeDto[],
  ancestors: CategoryRow[],
): ProductDetailDto {
  const pathIds = product.category.path.split('/').filter((s) => s.length > 0);
  const techData: TechDataDto[] = mappings.map((m) => {
    let value: string | number | boolean | null = null;
    for (const variant of product.variants) {
      const row = variant.attributes.find((a) => a.attributeId === m.id);
      if (!row) continue;
      value = typedValue(row);
      break;
    }
    return {
      key: m.key,
      label: m.label,
      labelHtml: m.labelHtml,
      groupName: m.groupName,
      unit: m.unit,
      type: m.type,
      value,
    };
  });

  const documents: DocumentDto[] = product.documents.map((d) => ({
    id: d.id,
    kind: d.kind,
    title: d.title,
    url: d.publicId !== null ? (mediaUrl(d.publicId) ?? d.url) : d.url,
    sizeBytes: d.sizeBytes,
  }));

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    brand: { slug: product.brand.slug, name: product.brand.name, isPremium: product.brand.isPremium },
    category: {
      id: product.category.id,
      code: product.category.code,
      name: product.category.name,
      pathSlugs: product.category.pathSlugs,
      path: toCrumbs(pathIds, ancestors),
    },
    shortDescription: product.shortDescription,
    descriptionHtml: product.descriptionHtml,
    isBestseller: product.isBestseller,
    priceFrom: product.minPrice === null ? null : product.minPrice.toFixed(2),
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    images: product.images.map((i) => ({
      id: i.id,
      url: mediaUrl(i.publicId) ?? '',
      alt: i.alt,
      kind: i.kind,
      variantId: i.variantId,
      sortOrder: i.sortOrder,
    })),
    documents,
    variants: product.variants.map(toVariantDto),
    techData,
  };
}

/** Admin images response (after a replace). */
export function toImageDtos(
  rows: Array<{ id: string; publicId: string; kind: ImageDto['kind']; alt: string | null; variantId: string | null; sortOrder: number }>,
): ImageDto[] {
  return rows.map((i) => ({ id: i.id, url: mediaUrl(i.publicId) ?? '', alt: i.alt, kind: i.kind, variantId: i.variantId, sortOrder: i.sortOrder }));
}
