'use client';

// Right PDP column (spec 6.4): brand badge, H1 (name + selected variant
// attribute), "Article no.: …", availability, variant selector, price panel,
// quantity stepper (minOrderQty/packSize rules) + disabled add-to-cart with
// explanatory tooltip (cart arrives with checkout) + "To quick entry" link.
import { AvailabilityDot, Badge, Button, QuantityStepper } from '@/components/ui';
import { routes } from '@/config/routes';
import { AddToCartButton } from '@/features/cart/add-to-cart-button';
import { VariantSelector } from './variant-selector';
import { PricePanel } from './price-panel';
import { variantDisplayName } from './variant-utils';
import type { ProductDetailDto, ResolvedPriceDto, VariantDto } from '@/shared/dto/product.dto';
import type { VariantAxis } from './variant-utils';

export interface BuyBoxProps {
  product: ProductDetailDto;
  variant: VariantDto;
  axes: VariantAxis[];
  onVariantSelect: (axisKey: string, value: string | number | boolean) => void;
  quantity: number;
  onQuantityChange: (qty: number) => void;
  resolved: ResolvedPriceDto | undefined;
  isResolving: boolean;
  locale: string;
}

export function BuyBox({
  product,
  variant,
  axes,
  onVariantSelect,
  quantity,
  onQuantityChange,
  resolved,
  isResolving,
  locale,
}: BuyBoxProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="brand">{product.brand.name}</Badge>
        {product.isBestseller ? <Badge variant="bestseller" /> : null}
      </div>

      <div>
        <h1 className="text-2xl font-bold leading-tight text-ink lg:text-3xl">
          {variantDisplayName(product, variant, axes)}
        </h1>
        <p className="mt-1.5 text-sm text-ink">
          <span className="font-bold">Article no.:</span> {variant.articleNo}
          {variant.ean ? <span className="ms-3 text-muted">EAN {variant.ean}</span> : null}
        </p>
        <div className="mt-1.5">
          <AvailabilityDot tone={variant.availability.tone} label={variant.availability.label} />
        </div>
        {product.shortDescription ? (
          <p className="mt-2 text-sm leading-6 text-muted">{product.shortDescription}</p>
        ) : null}
      </div>

      <VariantSelector
        variants={product.variants}
        axes={axes}
        selected={variant}
        onSelect={onVariantSelect}
      />

      <PricePanel
        variant={variant}
        resolved={resolved}
        isResolving={isResolving}
        locale={locale}
      />

      <div className="space-y-2.5 border-t border-line pt-4">
        <QuantityStepper
          value={quantity}
          onChange={onQuantityChange}
          min={variant.minOrderQty}
          step={variant.packSize}
          aria-label={`Quantity for article no. ${variant.articleNo}`}
        />
        <p className="text-xs text-muted">
          min. {variant.minOrderQty} · pack of {variant.packSize}
        </p>
        <AddToCartButton
          variantId={variant.id}
          quantity={quantity}
          minOrderQty={variant.minOrderQty}
          packSize={variant.packSize}
          showStepper={false}
        />
        <p className="text-sm text-ink">
          Do you want to order more than one article?{' '}
          <a
            href={routes(locale).quickOrder}
            className="font-bold text-brand underline underline-offset-2 transition-colors hover:text-brand-hover"
          >
            To quick entry
          </a>
        </p>
      </div>
    </div>
  );
}
