'use client';

// List view (spec 6.3): rows in three vertical-divided columns —
// (1) image + bestseller badge, bold product name, navy brand badge,
//     "Article no.: …", availability line, variants chip;
// (2) right-aligned price block (from-price, VAT note, delivery-cost link
//     with the shipping-info modal);
// (3) CTA column ("Go to variants" / quantity stepper + add-to-cart).
// Collapses to a stacked card on small screens.
import Link from 'next/link';
import { AvailabilityDot, Badge } from '@/components/ui';
import { routes } from '@/config/routes';
import type { ListingProductDto } from '@/shared/dto/product.dto';
import { ListingCta } from './listing-cta';
import { ListingImage } from './listing-image';
import { PriceWithShippingInfo } from './shipping-info-modal';

export interface ListingListProps {
  items: ListingProductDto[];
  locale: string;
}

export function ListingList({ items, locale }: ListingListProps) {
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => {
        const href = routes(locale).product(item.slug, item.firstArticleNo);
        return (
          <li
            key={item.id}
            className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_200px_220px] md:items-center md:gap-0"
          >
            {/* Column 1 — image, name, brand, article no., availability, variants */}
            <div className="flex gap-4 md:pr-6">
              <div className="w-28 shrink-0">
                {item.isBestseller ? <Badge variant="bestseller" className="mb-1" /> : null}
                <Link href={href} className="inline-block rounded-btn focus-visible:outline-none">
                  <ListingImage src={item.image} alt={item.imageAlt ?? item.name} size={112} />
                </Link>
              </div>
              <div className="flex min-w-0 flex-col items-start gap-1.5">
                <h3 className="text-base font-bold leading-5 text-ink">
                  <Link href={href} className="transition-colors hover:text-brand">
                    {item.name}
                  </Link>
                </h3>
                <Badge variant="brand">{item.brandName}</Badge>
                <p className="text-sm text-ink">
                  <span className="font-bold">Article no.:</span> {item.firstArticleNo}
                </p>
                <AvailabilityDot
                  tone={item.availability.tone}
                  label={item.availability.label}
                  size="sm"
                />
                {item.variantCount > 1 ? (
                  <Badge variant="count">
                    {item.variantCount} {item.variantCount === 1 ? 'variant' : 'variants'}
                  </Badge>
                ) : null}
              </div>
            </div>

            {/* Column 2 — price block (right-aligned) */}
            <div className="md:border-x md:border-line md:px-6 md:py-2">
              <PriceWithShippingInfo priceFrom={item.priceFrom} alignEnd />
            </div>

            {/* Column 3 — CTA */}
            <div className="md:pl-6">
              <ListingCta item={item} locale={locale} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
