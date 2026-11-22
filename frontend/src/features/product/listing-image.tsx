'use client';

// Listing product image with a neutral fallback tile when a product has no
// photo (reserve the box size to avoid layout shift, spec 13.7).
import { Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/cn';

export interface ListingImageProps {
  src: string | null;
  alt: string;
  /** Rendered box size in px (width = height). */
  size: number;
  className?: string;
  /** next/image sizes hint. */
  sizes?: string;
}

export function ListingImage({ src, alt, size, className, sizes }: ListingImageProps) {
  const boxStyle = { width: size, height: size };

  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={size}
        height={size}
        sizes={sizes ?? `${size}px`}
        style={boxStyle}
        className={cn('rounded-btn border border-line bg-white object-contain p-1', className)}
      />
    );
  }

  return (
    <span
      style={boxStyle}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-btn bg-tile text-muted',
        className,
      )}
      aria-hidden="true"
    >
      <ImageIcon className="h-8 w-8" strokeWidth={1.5} />
    </span>
  );
}
