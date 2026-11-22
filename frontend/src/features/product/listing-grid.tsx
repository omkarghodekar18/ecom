// Tile-card grid for product listings (spec 6.3): 2 columns mobile, 3 tablet,
// 4 desktop. Shared by brand pages now and category/search pages later.
import { cn } from '@/lib/cn';
import type { ListingProductDto } from '@/shared/dto/product.dto';
import { ListingCard } from './listing-card';

export interface ListingGridProps {
  items: ListingProductDto[];
  /** Locale base path, e.g. "/in/en". */
  locale: string;
  /** next/image priority on the first card (above-the-fold). */
  priorityFirst?: boolean;
  className?: string;
}

/** Responsive grid of ListingCard tiles with equal-height rows. */
export function ListingGrid({ items, locale, priorityFirst, className }: ListingGridProps) {
  return (
    <ul className={cn('grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4', className)}>
      {items.map((item, index) => (
        <li key={item.id} className="flex">
          <ListingCard
            product={item}
            locale={locale}
            priority={priorityFirst && index === 0}
          />
        </li>
      ))}
    </ul>
  );
}
