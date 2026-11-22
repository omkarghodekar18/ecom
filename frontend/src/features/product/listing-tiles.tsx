'use client';

// Tile view (spec 6.3): responsive card grid (2/3/4 columns) with image,
// name, navy brand badge, from-price, availability and the shared listing
// CTA.
import Link from 'next/link';
import { AvailabilityDot, Badge, PriceBlock } from '@/components/ui';
import { routes } from '@/config/routes';
import { site } from '@/config/site';
import { formatInr } from '@/lib/format';
import type { ListingProductDto } from '@/shared/dto/product.dto';
import { ListingCta } from './listing-cta';
import { ListingImage } from './listing-image';

export interface ListingTilesProps {
  items: ListingProductDto[];
  locale: string;
}

export function ListingTiles({ items, locale }: ListingTilesProps) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => {
        const href = routes(locale).product(item.slug, item.firstArticleNo);
        return (
          <li
            key={item.id}
            className="flex flex-col gap-3 rounded-tile border border-line bg-white p-4 transition-shadow hover:shadow-md"
          >
            <Link
              href={href}
              className="flex justify-center rounded-btn focus-visible:outline-none"
              aria-label={item.name}
            >
              <ListingImage src={item.image} alt={item.imageAlt ?? item.name} size={160} />
            </Link>
            <div className="flex min-h-0 flex-col items-start gap-1.5">
              {item.isBestseller ? <Badge variant="bestseller" /> : null}
              <h3 className="text-sm font-bold leading-5 text-ink">
                <Link href={href} className="transition-colors hover:text-brand">
                  {item.name}
                </Link>
              </h3>
              <Badge variant="brand">{item.brandName}</Badge>
              <PriceBlock
                prefix="from"
                amount={formatInr(item.priceFrom)}
                vatNote={site.copy.vatNote}
              />
              <AvailabilityDot
                tone={item.availability.tone}
                label={item.availability.label}
                size="sm"
              />
            </div>
            <div className="mt-auto">
              <ListingCta item={item} locale={locale} size="sm" />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
