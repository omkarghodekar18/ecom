'use client';

// Sticky bottom bar (spec 6.4): appears once the buy box has been scrolled
// past (IntersectionObserver on a sentinel). Left: truncated product name;
// right: price + VAT note + add-to-cart + scroll-to-top. Respects the iOS
// safe-area inset.
import { ChevronUp } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import { Button } from '@/components/ui';
import { site } from '@/config/site';
import { cn } from '@/lib/cn';
import { AddToCartButton } from '@/features/cart/add-to-cart-button';

export interface StickyBarProps {
  /** Sentinel element placed right after the buy box. */
  sentinelRef: RefObject<HTMLElement | null>;
  /** Truncated-left product title, e.g. "Centre drill HSS-E A TiAlN 1 mm". */
  title: string;
  /** Pre-formatted price, e.g. "INR 2,357.30". */
  price: string;
  /** Variant + quantity for the add-to-cart control. */
  variantId: string;
  quantity: number;
  minOrderQty: number;
  packSize: number;
}

export function StickyBar({ sentinelRef, title, price, variantId, quantity, minOrderQty, packSize }: StickyBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // "Scrolled past": the sentinel's bottom edge is above the viewport top.
          setVisible(!entry.isIntersecting && entry.boundingClientRect.bottom < 0);
        }
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinelRef]);

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.08)] transition-transform duration-200',
        visible ? 'translate-y-0' : 'pointer-events-none translate-y-full',
      )}
    >
      <div className="page-container flex items-center gap-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{title}</p>
        <div className="hidden shrink-0 flex-col items-end sm:flex">
          <span className="text-base font-bold text-ink">{price}</span>
          <span className="text-xs text-muted">{site.copy.vatNote}</span>
        </div>
        <div className="shrink-0">
          <AddToCartButton
            variantId={variantId}
            quantity={quantity}
            minOrderQty={minOrderQty}
            packSize={packSize}
            showStepper={false}
            size="md"
            fullWidth={false}
          />
        </div>
        <button
          type="button"
          aria-label="Scroll back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn border border-line bg-white text-ink transition-colors hover:border-brand hover:text-brand"
        >
          <ChevronUp className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
