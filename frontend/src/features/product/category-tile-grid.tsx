// Subcategory tile grid for non-leaf category pages (spec 6.2): grey tiles
// (4 columns desktop / 2 tablet / 1 mobile) with the category image or a
// neutral glyph on the left and the label with live product count on the
// right, e.g. "Drills (632)".
import { Wrench } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { routes } from '@/config/routes';
import type { CategoryDto } from '@/shared/dto/catalog.dto';

export interface CategoryTileGridProps {
  /** Immediate active children of the current category. */
  categories: CategoryDto[];
  /** Locale base, e.g. "/in/en". */
  locale: string;
}

export function CategoryTileGrid({ categories, locale }: CategoryTileGridProps) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {categories.map((child) => (
        <li key={child.code}>
          <Link
            href={routes(locale).category(child.pathSlugs, child.code)}
            className="group flex h-full items-center gap-4 rounded-tile bg-tile p-4 transition-colors hover:bg-line/60 focus-visible:outline-none"
          >
            {child.image ? (
              <Image
                src={child.image}
                alt=""
                width={64}
                height={64}
                sizes="64px"
                className="h-16 w-16 shrink-0 rounded-btn bg-white object-contain p-1"
              />
            ) : (
              <span
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-btn bg-white text-ink/70"
                aria-hidden="true"
              >
                <Wrench className="h-7 w-7" strokeWidth={1.5} />
              </span>
            )}
            <span className="min-w-0">
              <span className="block font-bold text-ink transition-colors group-hover:text-brand">
                {child.name}
              </span>
              <span className="text-sm text-muted">({child.productCount})</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
