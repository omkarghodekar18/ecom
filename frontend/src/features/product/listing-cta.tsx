'use client';

// Listing row/card CTA (spec 6.3): products with more than one variant link
// to the PDP variant selector with an orange "Go to variants" button; single-
// variant products get a quantity stepper plus a live "Add to shopping cart"
// button (server-side rules apply — adjustments come back as toasts).
import { List } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { routes } from '@/config/routes';
import { AddToCartButton } from '@/features/cart/add-to-cart-button';
import type { ListingProductDto } from '@/shared/dto/product.dto';

export interface ListingCtaProps {
  item: ListingProductDto;
  /** Locale base, e.g. "/in/en". */
  locale: string;
  /** Control size (sm inside tiles). @default 'md' */
  size?: 'sm' | 'md';
}

export function ListingCta({ item, locale, size = 'md' }: ListingCtaProps) {
  const [qty, setQty] = useState(1);
  const href = routes(locale).product(item.slug, item.firstArticleNo);

  if (item.variantCount > 1 || item.firstVariantId === '') {
    return (
      <Button href={href} variant="primary" size={size} fullWidth>
        <List className="h-4 w-4" aria-hidden="true" />
        Go to variants
      </Button>
    );
  }

  return (
    <AddToCartButton
      variantId={item.firstVariantId}
      quantity={qty}
      minOrderQty={1}
      packSize={1}
      onQuantityChange={setQty}
      size={size}
      label="Add to shopping cart"
    />
  );
}
