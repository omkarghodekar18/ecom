'use client';

// Related products row (spec 6.4): a horizontal, snap-scrolling carousel of
// listing cards reusing the shared ListingCard, with prev/next buttons that
// scroll by one card and disable at the track edges.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ListingCard } from '@/features/product/listing-card';
import type { ListingProductDto } from '@/shared/dto/product.dto';

export interface RelatedCarouselProps {
  products: ListingProductDto[];
  locale: string;
}

export function RelatedCarousel({ products, locale }: RelatedCarouselProps) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const syncEdges = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    syncEdges();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener('scroll', syncEdges, { passive: true });
    window.addEventListener('resize', syncEdges);
    return () => {
      el.removeEventListener('scroll', syncEdges);
      window.removeEventListener('resize', syncEdges);
    };
  }, [syncEdges]);

  if (products.length === 0) return null;

  const scrollBy = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector('li');
    const step = card ? (card as HTMLElement).offsetWidth + 16 : el.clientWidth * 0.8;
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  return (
    <section aria-labelledby="related-heading" className="mt-12">
      <div className="flex items-center justify-between gap-4">
        <h2 id="related-heading" className="text-lg font-bold text-ink">
          Matching products
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Scroll related products left"
            onClick={() => scrollBy(-1)}
            disabled={atStart}
            className="flex h-9 w-9 items-center justify-center rounded-btn border border-line bg-white text-ink transition-colors hover:border-brand hover:text-brand disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Scroll related products right"
            onClick={() => scrollBy(1)}
            disabled={atEnd}
            className="flex h-9 w-9 items-center justify-center rounded-btn border border-line bg-white text-ink transition-colors hover:border-brand hover:text-brand disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <ul
        ref={trackRef}
        className="slim-scrollbar mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2"
      >
        {products.map((product) => (
          <li key={product.id} className="w-[220px] shrink-0 snap-start sm:w-[240px]">
            <ListingCard product={product} locale={locale} sizes="240px" />
          </li>
        ))}
      </ul>
    </section>
  );
}
