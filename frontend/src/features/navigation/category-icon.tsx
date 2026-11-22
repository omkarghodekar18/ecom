import Image from 'next/image';
import { Wrench } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface CategoryIconProps {
  /** Category icon URL (null in the seed data → neutral fallback glyph). */
  src: string | null;
  className?: string;
}

/** 40px category icon box (spec 5.2): the category image or a lucide fallback. */
export function CategoryIcon({ src, className }: CategoryIconProps) {
  if (src) {
    return (
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-btn bg-tile',
          className,
        )}
      >
        <Image src={src} alt="" width={40} height={40} className="h-full w-full object-contain" />
      </span>
    );
  }
  return (
    <span
      className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-tile', className)}
      aria-hidden="true"
    >
      <Wrench className="h-5 w-5 text-ink/70" />
    </span>
  );
}
