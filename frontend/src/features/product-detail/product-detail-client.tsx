'use client';

// PDP client island (spec 6.4): orchestrates the selected variant —
// URL (?variant=… via router.replace, no full reload), document.title, price
// resolution, quantity (minOrderQty/packSize), variant-scoped images and
// technical data — around the gallery / buy box / tabs / sticky bar /
// related + recently viewed sections.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { routes, slugifyArticleNo } from '@/config/routes';
import { formatInr } from '@/lib/format';
import { useResolvedPrice } from './use-resolved-price';
import { BuyBox } from './buy-box';
import { Gallery } from './gallery';
import { ProductTabs } from './product-tabs';
import { RecentlyViewed } from './recently-viewed';
import { RelatedCarousel } from './related-carousel';
import { StickyBar } from './sticky-bar';
import { findVariantBySlug } from './slug';
import { imagesForVariant, selectVariant, variantAxes, variantDisplayName } from './variant-utils';
import type { CategoryAttributeDto } from '@/shared/dto/catalog.dto';
import type { ListingProductDto, ProductDetailDto, VariantDto } from '@/shared/dto/product.dto';

export interface ProductDetailClientProps {
  product: ProductDetailDto;
  related: ListingProductDto[];
  /** Category attribute definitions (variant axes + tech-data labels). */
  defs: CategoryAttributeDto[];
  locale: string;
  /** Slugified article number pre-selected via URL (?variant= or slug tail). */
  initialVariantSlug: string | null;
}

/** Snaps `qty` into the new variant's [minOrderQty, ∞) step grid. */
export function resnapQuantity(qty: number, min: number, pack: number): number {
  const safeMin = Math.max(1, min);
  const safePack = Math.max(1, pack);
  const clamped = Math.max(qty, safeMin);
  return safeMin + Math.round((clamped - safeMin) / safePack) * safePack;
}

export function ProductDetailClient({
  product,
  related,
  defs,
  locale,
  initialVariantSlug,
}: ProductDetailClientProps) {
  const router = useRouter();
  const buyBoxEndRef = useRef<HTMLDivElement>(null);
  const variants = product.variants;

  const initialVariant = useMemo<VariantDto | undefined>(
    () => (initialVariantSlug ? findVariantBySlug(variants, initialVariantSlug) : undefined) ?? variants[0],
    [initialVariantSlug, variants],
  );

  const [variant, setVariant] = useState<VariantDto | undefined>(initialVariant);
  const [quantity, setQuantity] = useState(Math.max(1, initialVariant?.minOrderQty ?? 1));
  const axes = useMemo(() => variantAxes(defs, variants), [defs, variants]);
  const { resolved, isResolving } = useResolvedPrice(variant, quantity);

  const displayName = variant ? variantDisplayName(product, variant, axes) : product.name;

  // Keep the tab title in sync with the selected variant (no full reload).
  useEffect(() => {
    document.title = `${displayName} | ${product.category.name} | ${product.brand.name}`;
  }, [displayName, product.category.name, product.brand.name]);

  if (!variant) {
    return (
      <div className="mt-6 rounded-tile border border-line bg-tile p-6 text-sm text-muted">
        This product currently has no purchasable variants.
      </div>
    );
  }

  // `variant` is drawn from `variants`, so the default variant exists too —
  // this guard only satisfies the compiler's index-access check.
  const firstVariant = variants[0];
  if (!firstVariant) {
    return (
      <div className="mt-6 rounded-tile border border-line bg-tile p-6 text-sm text-muted">
        This product currently has no purchasable variants.
      </div>
    );
  }

  const handleVariantSelect = (axisKey: string, value: string | number | boolean) => {
    const next = selectVariant(variants, axes, axisKey, value, variant);
    if (next.id === variant.id) return;
    setVariant(next);
    setQuantity((q) => resnapQuantity(q, next.minOrderQty, next.packSize));
    // Soft URL update (?variant=…); no full reload, no scroll jump.
    const slug = slugifyArticleNo(next.articleNo);
    router.replace(`${routes(locale).product(product.slug, firstVariant.articleNo)}?variant=${slug}`, {
      scroll: false,
    });
  };

  const effectivePrice = resolved ? resolved.unitPrice : variant.listPrice;
  const recentEntry = {
    id: product.id,
    slug: product.slug,
    name: product.name,
    brandName: product.brand.name,
    brandSlug: product.brand.slug,
    firstArticleNo: firstVariant.articleNo,
    firstVariantId: firstVariant.id,
    isBestseller: product.isBestseller,
    variantCount: variants.length,
    priceFrom: product.priceFrom,
    image: product.images[0]?.url ?? null,
    imageAlt: product.images[0]?.alt ?? null,
    availability: firstVariant.availability,
  };

  return (
    <div className="page-container pb-16 pt-4 lg:pt-6">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] xl:gap-10">
        <Gallery images={imagesForVariant(product.images, variant.id)} name={product.name} priority />
        <div>
          <BuyBox
            product={product}
            variant={variant}
            axes={axes}
            onVariantSelect={handleVariantSelect}
            quantity={quantity}
            onQuantityChange={setQuantity}
            resolved={resolved}
            isResolving={isResolving}
            locale={locale}
          />
          {/* Sentinel for the sticky bottom bar: it appears once this point
              has been scrolled past. */}
          <div ref={buyBoxEndRef} aria-hidden="true" />
        </div>
      </div>

      <ProductTabs product={product} variant={variant} defs={defs} locale={locale} />

      <RelatedCarousel products={related} locale={locale} />
      <RecentlyViewed current={recentEntry} locale={locale} />

      <StickyBar
        sentinelRef={buyBoxEndRef}
        title={`${displayName} — Article no.: ${variant.articleNo}`}
        price={formatInr(effectivePrice)}
        variantId={variant.id}
        quantity={quantity}
        minOrderQty={variant.minOrderQty}
        packSize={variant.packSize}
      />
    </div>
  );
}
