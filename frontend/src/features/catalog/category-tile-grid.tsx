// Homepage category tile grid (spec 6.1.2): "Our assortment." heading with
// the muted "More than 500,000 products." tagline, then grey #F2F2F2 tiles —
// category image (or icon fallback) left, label + live product count right —
// linking to the category pages. 4 columns desktop / 2 tablet / 1 mobile.
import {
  Boxes,
  Disc3,
  Drill,
  FlaskConical,
  Grip,
  Hammer,
  PlugZap,
  Ruler,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { routes } from '@/config/routes';
import type { HomeCategoryTile } from '@/features/cms/cms.dto';

/** Neutral icon per top-level category slug; Wrench is the fallback. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  machining: Drill,
  'clamping-technology': Grip,
  'measurement-technology': Ruler,
  'grinding-cutting-technology': Disc3,
  'hand-tools': Hammer,
  'workstations-storage-and-factory-equipment': Boxes,
  'power-tools-and-pneumatic-tools': PlugZap,
  'chemical-technical-products': FlaskConical,
};

function TileIcon({ tile }: { tile: HomeCategoryTile }) {
  const iconClasses = 'h-8 w-8 text-ink/70';
  if (tile.image) {
    return (
      <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-btn bg-white">
        <Image
          src={tile.image}
          alt=""
          width={64}
          height={64}
          sizes="64px"
          className="h-full w-full object-contain"
        />
      </span>
    );
  }
  const Icon = CATEGORY_ICONS[tile.slug] ?? Wrench;
  return (
    <span
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-btn bg-white"
      aria-hidden="true"
    >
      <Icon className={iconClasses} />
    </span>
  );
}

export interface CategoryTileGridProps {
  tiles: HomeCategoryTile[];
  /** Locale base path, e.g. "/in/en". */
  locale: string;
}

/** "Our assortment." section with the grey category tile grid. */
export function CategoryTileGrid({ tiles, locale }: CategoryTileGridProps) {
  if (tiles.length === 0) return null;
  const r = routes(locale);

  return (
    <section aria-labelledby="assortment-title" className="page-container py-10 lg:py-14">
      <h2 id="assortment-title" className="text-xl sm:text-2xl">
        <span className="font-bold text-ink">Our assortment.</span>{' '}
        <span className="font-medium text-muted">More than 500,000 products.</span>
      </h2>
      <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.code}>
            <Link
              href={r.category(tile.pathSlugs, tile.code)}
              className="flex h-full items-center gap-4 rounded-tile bg-tile p-4 transition-colors hover:bg-line/40"
            >
              <TileIcon tile={tile} />
              <span className="flex min-w-0 flex-col">
                <span className="font-bold leading-snug text-ink">{tile.name}</span>
                <span className="mt-0.5 text-sm text-muted">
                  {tile.productCount.toLocaleString('en-IN')} products
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
