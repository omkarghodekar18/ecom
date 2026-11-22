'use client';

// Sticky-offset hook: the storefront header is sticky (orange + white bars)
// with a breakpoint-dependent height. Sticky PDP tabs must sit exactly below
// it, so the height is measured at runtime (with a ResizeObserver) and
// exposed as a CSS length string.
import { useEffect, useState } from 'react';

const FALLBACK_OFFSET_PX = 120;

export function useHeaderOffset(): string {
  const [offset, setOffset] = useState<number>(FALLBACK_OFFSET_PX);

  useEffect(() => {
    const header = document.querySelector('header');
    if (!header) return;
    const measure = () => setOffset(header.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return `${offset}px`;
}
