'use client';

// Hero slider (spec 6.1.1): dots + prev/next arrows, 6 s autoplay that pauses
// on hover and keyboard focus. Slides are stacked and cross-faded; inactive
// slides are `inert` so their links never steal focus.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { HeroSlide, type HeroSlideData } from './hero-slide';

const AUTOPLAY_MS = 6000;

export interface HeroSliderProps {
  slides: HeroSlideData[];
  /** Responsive sizes hint forwarded to every slide image. */
  sizes?: string;
  /** Height classes for the slide area, e.g. "h-[400px]". */
  className?: string;
  /** Accessible name for the landmark. @default 'Featured promotions' */
  'aria-label'?: string;
}

export function HeroSlider({
  slides,
  sizes = '100vw',
  className,
  'aria-label': ariaLabel = 'Featured promotions',
}: HeroSliderProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Autoplay: a timeout keyed on [index] restarts the countdown after every
  // manual navigation; hovering or focusing the slider pauses it.
  useEffect(() => {
    if (paused || prefersReducedMotion || count <= 1) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [index, paused, prefersReducedMotion, count]);

  if (count === 0) return null;
  if (count === 1) {
    const only = slides[0];
    if (!only) return null;
    return <HeroSlide slide={only} priority sizes={sizes} className={className} />;
  }

  const go = (next: number) => setIndex(((next % count) + count) % count);

  const arrowClasses =
    'absolute top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white transition-colors hover:bg-black/60 focus-visible:outline-white';

  return (
    <section
      aria-label={ariaLabel}
      className={cn('group relative', className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* The section itself carries the height class; slides fill it. */}
      {slides.map((slide, i) => (
        <div
          key={`${slide.heading}-${i}`}
          className={cn(
            'absolute inset-0 transition-opacity duration-700',
            i === index ? 'z-10 opacity-100' : 'opacity-0',
          )}
          {...(i === index ? {} : { inert: true })}
          aria-hidden={i !== index}
        >
          <HeroSlide slide={slide} priority={i === 0} sizes={sizes} className="h-full rounded-tile" />
        </div>
      ))}

      <button
        type="button"
        onClick={() => go(index - 1)}
        aria-label="Previous slide"
        className={cn(arrowClasses, 'left-3')}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => go(index + 1)}
        aria-label="Next slide"
        className={cn(arrowClasses, 'right-3')}
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="absolute bottom-4 right-5 z-20 flex items-center gap-2">
        {slides.map((slide, i) => (
          <button
            key={`${slide.heading}-dot-${i}`}
            type="button"
            onClick={() => go(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === index ? 'true' : undefined}
            className={cn(
              'h-2.5 w-2.5 rounded-full border border-white transition-colors focus-visible:outline-white',
              i === index ? 'bg-white' : 'bg-white/40 hover:bg-white/70',
            )}
          />
        ))}
      </div>
    </section>
  );
}
