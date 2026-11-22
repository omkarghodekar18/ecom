'use client';

// PDP gallery (spec 6.4): vertical thumbnail strip (kind badges on drawings),
// large square main image with reserved space, "Click to enlarge image"
// opening a fullscreen lightbox (zoom toggle, keyboard arrows, swipe, Esc).
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Ruler, PencilRuler, Image as ImageIcon } from 'lucide-react';
import { Modal } from '@/components/ui';
import { cn } from '@/lib/cn';
import { mediaUrl } from '@/features/cms/media-url';
import type { ImageDto } from '@/shared/dto/product.dto';

const KIND_META: Record<ImageDto['kind'], { label: string; Icon: typeof ImageIcon }> = {
  PHOTO: { label: 'Photo', Icon: ImageIcon },
  DRAWING: { label: 'Dimensional drawing', Icon: Ruler },
  TECHNICAL: { label: 'Technical data', Icon: PencilRuler },
  OTHER: { label: 'More', Icon: Maximize2 },
};

function KindBadge({ kind }: { kind: ImageDto['kind'] }) {
  if (kind === 'PHOTO') return null;
  const { label, Icon } = KIND_META[kind];
  return (
    <span
      title={label}
      aria-label={label}
      className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-btn bg-tile text-ink"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}

/** Fullscreen lightbox: zoom (layout width 200%), arrows, swipe, Esc via Modal. */
function Lightbox({
  images,
  index,
  onIndexChange,
  open,
  onOpenChange,
  title,
}: {
  images: ImageDto[];
  index: number;
  onIndexChange: (i: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  const [zoomed, setZoomed] = useState(false);
  const touchStart = useRef<number | null>(null);
  const total = images.length;
  const image = images[index];

  const go = useCallback(
    (delta: number) => {
      if (total === 0) return;
      onIndexChange((index + delta + total) % total);
      setZoomed(false);
    },
    [index, onIndexChange, total],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, go]);

  if (!image) return null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={`${KIND_META[image.kind].label} · Image ${index + 1} of ${total}${zoomed ? ' · zoomed — click to reset' : ' · click image to zoom'}`}
      className="max-h-[92vh] w-[min(96vw,1200px)] max-w-none"
      closeLabel="Close image viewer"
    >
      <div
        className="relative"
        onTouchStart={(e) => {
          touchStart.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current;
          touchStart.current = null;
          const end = e.changedTouches[0]?.clientX ?? null;
          if (start === null || end === null) return;
          if (end - start > 40) go(-1);
          if (start - end > 40) go(1);
        }}
      >
        <div className="slim-scrollbar h-[68vh] overflow-auto rounded-btn bg-tile">
          {/* eslint-disable-next-line @next/next/no-img-element -- zoom-to-pan needs a raw <img> whose rendered width transitions (next/image cannot) */}
          <img
            src={mediaUrl(image.url)}
            alt={image.alt ?? title}
            onClick={() => setZoomed((z) => !z)}
            className={cn(
              'mx-auto block h-auto w-full cursor-zoom-in transition-[width] duration-200',
              zoomed && 'w-[200%] cursor-zoom-out',
            )}
          />
        </div>
        {total > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-md transition-colors hover:bg-white"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next image"
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-md transition-colors hover:bg-white"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

export interface GalleryProps {
  images: ImageDto[];
  /** Product name for alt texts and the lightbox title. */
  name: string;
  /** next/image priority for the first gallery image (above the fold). */
  priority?: boolean;
}

/** Left PDP column: thumbnails + main image + "Click to enlarge image". */
export function Gallery({ images, name, priority }: GalleryProps) {
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Increments on every open so the Lightbox remounts fresh (zoom reset)
  // while staying mounted during the close transition (exit animation).
  const [openCount, setOpenCount] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-tile border border-line bg-tile text-sm text-muted">
        No image available
      </div>
    );
  }

  const current = images[Math.min(active, images.length - 1)];
  if (!current) return null;

  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse">
      {/* Main image (reserved aspect-square space, no CLS). */}
      <div className="min-w-0 flex-1">
        <div className="relative aspect-square overflow-hidden rounded-tile border border-line bg-white">
          <Image
            src={mediaUrl(current.url)}
            alt={current.alt ?? name}
            fill
            priority={priority}
            sizes="(max-width: 1024px) 100vw, 55vw"
            className="object-contain p-4"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setOpenCount((c) => c + 1);
            setLightboxOpen(true);
          }}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand underline underline-offset-2 transition-colors hover:text-brand-hover"
        >
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
          Click to enlarge image
        </button>
      </div>

      {/* Thumbnail strip: vertical on desktop, horizontal on mobile. */}
      <div
        role="tablist"
        aria-label={`${name} images`}
        className="slim-scrollbar flex gap-2 overflow-x-auto lg:w-20 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto"
      >
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`${KIND_META[img.kind].label} ${i + 1}`}
            onClick={() => setActive(i)}
            className={cn(
              'relative h-20 w-20 shrink-0 overflow-hidden rounded-btn border bg-white transition-colors',
              i === active ? 'border-brand' : 'border-line hover:border-muted',
            )}
          >
            <Image
              src={mediaUrl(img.url)}
              alt=""
              fill
              sizes="80px"
              className="object-contain p-1"
            />
            <KindBadge kind={img.kind} />
          </button>
        ))}
      </div>

      <Lightbox
        key={openCount}
        images={images}
        index={Math.min(active, images.length - 1)}
        onIndexChange={setActive}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        title={name}
      />
    </div>
  );
}
