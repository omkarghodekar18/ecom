// One hero slide: full-bleed image under a dark gradient overlay, small white
// eyebrow, large bold white headline and an outlined white "Learn more" button
// with a chevron (spec 6.1.1). Client-safe presentational piece — no hooks,
// used by both the home hero (via the client slider) and CMS hero blocks.
import { ChevronRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { mediaUrl } from './media-url';

export interface HeroSlideData {
  image: string;
  eyebrow: string | null;
  heading: string;
  subheading: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
}

export interface HeroSlideProps {
  slide: HeroSlideData;
  /** next/image priority — only the very first above-the-fold slide. */
  priority?: boolean;
  /** Responsive sizes hint; default fits a full-width band. */
  sizes?: string;
  /** Controls the height/rounding from the call site. */
  className?: string;
}

/** Renders one hero slide; the parent controls height via `className`. */
export function HeroSlide({ slide, priority, sizes = '100vw', className }: HeroSlideProps) {
  return (
    <div className={cn('relative overflow-hidden bg-tile', className)}>
      <Image
        src={mediaUrl(slide.image)}
        alt={slide.heading}
        fill
        priority={priority}
        sizes={sizes}
        className="object-cover"
      />
      {/* Dark gradient overlay keeps the white copy readable on any photo. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/10" aria-hidden="true" />
      <div className="absolute inset-0 flex flex-col items-start justify-end gap-3 p-5 sm:p-8 lg:p-10">
        {slide.eyebrow ? (
          <p className="text-xs font-bold uppercase tracking-wide text-white/90">{slide.eyebrow}</p>
        ) : null}
        <h2 className="max-w-2xl text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl">
          {slide.heading}
        </h2>
        {slide.subheading ? (
          <p className="max-w-xl text-sm leading-6 text-white/85 sm:text-base">{slide.subheading}</p>
        ) : null}
        {slide.ctaHref ? (
          <Link
            href={slide.ctaHref}
            className="mt-1 inline-flex h-11 items-center gap-1.5 rounded-btn border border-white bg-transparent px-5 text-sm font-bold text-white transition-colors hover:bg-white hover:text-ink focus-visible:outline-white"
          >
            {slide.ctaLabel ?? (
              <>
                Learn more
                <span className="sr-only"> about {slide.heading}</span>
              </>
            )}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
