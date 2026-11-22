// Generic banner card (HOME_HIGHLIGHT banners): reserved 4:3 image area,
// eyebrow, bold heading, muted subheading and an orange text CTA. Used for the
// "Our highlights" 3-card row on the homepage (spec 6.1.3).
import { ChevronRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { BannerDto } from './cms.dto';
import { mediaUrl } from './media-url';

export interface BannerCardProps {
  banner: BannerDto;
  /** Responsive sizes hint for the card image. */
  sizes?: string;
}

/** Highlight card with image, eyebrow, heading, subheading and CTA. */
export function BannerCard({ banner, sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw' }: BannerCardProps) {
  return (
    <article className="flex flex-col overflow-hidden rounded-tile border border-line bg-white transition-colors hover:border-brand">
      <div className="relative aspect-[4/3] bg-tile">
        <Image
          src={mediaUrl(banner.image)}
          alt={banner.heading}
          fill
          sizes={sizes}
          className="object-cover"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        {banner.eyebrow ? (
          <p className="text-xs font-bold uppercase tracking-wide text-brand">{banner.eyebrow}</p>
        ) : null}
        <h3 className="font-bold leading-snug text-ink">{banner.heading}</h3>
        {banner.subheading ? <p className="text-sm leading-6 text-muted">{banner.subheading}</p> : null}
        {banner.ctaHref ? (
          <Link
            href={banner.ctaHref}
            className="mt-auto inline-flex w-fit items-center gap-1 pt-2 text-sm font-bold text-brand transition-colors hover:text-brand-hover"
          >
            {banner.ctaLabel ?? (
              <>
                Learn more
                <span className="sr-only"> about {banner.heading}</span>
              </>
            )}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </article>
  );
}
