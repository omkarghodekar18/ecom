// Cart DTO mapping: repository rows + resolved prices → CartItemDto. Reuses
// the products mapper (availability + attribute maps) via its public surface.
import type { CartItemDto } from '../../shared/dto/cart.dto.js';
import type { AvailabilityDto, VariantAttributes } from '../../shared/dto/product.dto.js';
import type { Prisma } from '@prisma/client';
import { availabilityOf, attributesMap } from '../products/index.js';
import { mediaUrl } from '../catalog/public-id.util.js';
import type { CartItemRow } from './cart.repository.js';
import type { PriceBasis } from '../pricing/index.js';

/** True while the item's variant is publicly buyable (published product, active variant). */
export function isBuyable(row: CartItemRow): boolean {
  return (
    row.variant.deletedAt === null &&
    row.variant.isActive &&
    row.variant.product.status === 'PUBLISHED' &&
    row.variant.product.deletedAt === null
  );
}

export function toCartItemDto(
  row: CartItemRow,
  unitPrice: Prisma.Decimal,
  basis: PriceBasis,
): CartItemDto {
  const variant = row.variant;
  const image = variant.images[0] ?? variant.product.images[0] ?? null;
  const attributes: VariantAttributes = attributesMap(
    variant.attributes as Parameters<typeof attributesMap>[0],
  );
  const availability: AvailabilityDto = availabilityOf(variant);
  return {
    id: row.id,
    variantId: variant.id,
    articleNo: variant.articleNo,
    productName: variant.product.name,
    productSlug: variant.product.slug,
    variantName: variant.name,
    brandName: variant.product.brand.name,
    attributes,
    image: image === null ? null : mediaUrl(image.publicId),
    imageAlt: image?.alt ?? null,
    unitPrice: unitPrice.toFixed(2),
    listPrice: variant.listPrice.toFixed(2),
    priceBasis: basis,
    quantity: row.quantity,
    lineTotal: unitPrice.mul(row.quantity).toFixed(2),
    currency: variant.currency,
    minOrderQty: variant.minOrderQty,
    packSize: variant.packSize,
    note: row.note,
    availability,
  };
}
