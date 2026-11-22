// Tile card for product listings (spec 6.3 tile view): reserved square image
// with bestseller badge, brand badge, name, "from" price, availability dot and
// an orange CTA to the PDP. Used by brand pages now; category/search listings
// reuse it later. Server component.
import Image from 'next/image';
import Link from 'next/link';
import { AvailabilityDot, Badge, Button, PriceBlock } from '@/components/ui';
import { routes } from '@/config/routes';
import { formatInr } from '@/lib/format';
import { mediaUrl } from '@/features/cms/media-url';
import type { ListingProductDto } from '@/shared/dto/product.dto';

export interface ListingCardProps {
  product: ListingProductDto;
  /** Locale base path, e.g. "/in/en". */
  locale: string;
  /** next/image priority for the first card of the first page. */
  priority?: boolean;
  /** Responsive sizes hint. */
  sizes?: string;
}

/** One product tile card. */
export function ListingCard({
  product,
  locale,
  priority,
  sizes = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw',
}: ListingCardProps) {
  const href = routes(locale).product(product.slug, product.firstArticleNo);

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-tile border border-line bg-white transition-colors hover:border-brand">
      <Link
        href={href}
        aria-label={`View ${product.name} (article no. ${product.firstArticleNo})`}
        className="relative block aspect-square bg-tile"
      >
        {product.image ? (
          <Image
            src={mediaUrl(product.image)}
            alt={product.imageAlt ?? product.name}
            fill
            priority={priority}
            sizes={sizes}
            className="object-contain p-3"
          />
        ) : null}
        {product.isBestseller ? (
          <Badge variant="bestseller" className="absolute left-3 top-3" />
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <Badge variant="brand">{product.brandName}</Badge>
        <Link
          href={href}
          className="line-clamp-2 text-sm font-bold leading-snug text-ink transition-colors hover:text-brand"
        >
          {product.name}
        </Link>
        {product.priceFrom ? (
          <PriceBlock prefix="from" amount={formatInr(product.priceFrom)} />
        ) : (
          <p className="text-sm text-muted">Price on request</p>
        )}
        <AvailabilityDot
          tone={product.availability.tone}
          label={product.availability.label}
          size="sm"
          className="text-xs"
        />
        <Button href={href} variant="primary" size="sm" fullWidth className="mt-auto">
          View product
        </Button>
      </div>
    </article>
  );
}
