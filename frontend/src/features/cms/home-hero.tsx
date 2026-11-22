// Home hero grid (spec 6.1.1): a large slider (or static slide) on ~2/3 of
// the width and two stacked teaser cards (HOME_SIDE_TOP / HOME_SIDE_BOTTOM)
// on the right — light background, text left, product image right, outlined
// "Learn more" button. Server component; the slider is the only client piece.
import { ChevronRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { BannerDto } from './cms.dto';
import { HeroSlide } from './hero-slide';
import { HeroSlider } from './hero-slider';
import { mediaUrl } from './media-url';

const SLIDE_HEIGHTS = 'h-[280px] rounded-tile sm:h-[340px] lg:h-[400px]';
const SLIDE_SIZES = '(max-width: 1024px) 100vw, 62vw';

/** Right-column teaser card (light bg, text left, product image right). */
function SideTeaser({ banner }: { banner: BannerDto }) {
  return (
    <article className="flex h-full min-h-[150px] overflow-hidden rounded-tile bg-tile">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-4">
        {banner.eyebrow ? (
          <p className="text-xs font-bold uppercase tracking-wide text-brand">{banner.eyebrow}</p>
        ) : null}
        <h3 className="text-base font-bold leading-snug text-ink">{banner.heading}</h3>
        {banner.subheading ? (
          <p className="text-xs leading-5 text-muted">{banner.subheading}</p>
        ) : null}
        {banner.ctaHref ? (
          <Link
            href={banner.ctaHref}
            className="mt-auto inline-flex h-9 w-fit items-center gap-1 rounded-btn border border-line bg-white px-3.5 text-xs font-bold text-ink transition-colors hover:border-brand hover:text-brand"
          >
            {banner.ctaLabel ?? 'Learn more'}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      <div className="relative w-28 shrink-0 bg-white sm:w-32">
        <Image
          src={mediaUrl(banner.image)}
          alt=""
          fill
          sizes="128px"
          className="object-contain p-2"
        />
      </div>
    </article>
  );
}

export interface HomeHeroProps {
  heroes: BannerDto[];
  sideTop: BannerDto[];
  sideBottom: BannerDto[];
}

/** Hero grid section for the homepage (spec 6.1.1). */
export function HomeHero({ heroes, sideTop, sideBottom }: HomeHeroProps) {
  const sides = [sideTop[0], sideBottom[0]].filter((banner) => banner !== undefined);

  return (
    <section aria-label="Featured" className="page-container pt-4 lg:pt-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {heroes.length > 1 ? (
            <HeroSlider slides={heroes} sizes={SLIDE_SIZES} className={SLIDE_HEIGHTS} />
          ) : heroes.length === 1 && heroes[0] ? (
            <HeroSlide
              slide={heroes[0]}
              priority
              sizes={SLIDE_SIZES}
              className={SLIDE_HEIGHTS}
            />
          ) : null}
        </div>
        {sides.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:grid-rows-2">
            {sides.map((banner) => (
              <SideTeaser key={banner.placement} banner={banner} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
