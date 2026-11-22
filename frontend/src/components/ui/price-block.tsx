'use client';

import { cn } from '@/lib/cn';

/** Link-styled delivery info rendered under the price. */
export interface PriceBlockDeliveryInfo {
  label: string;
  onClick: () => void;
}

/**
 * Presentational price block used on listing rows and the PDP buy box: an
 * optional small grey "from" prefix above a big bold amount (already
 * formatted, e.g. "INR 2,302.30" from `formatInr`), a muted VAT note and an
 * underlined link-styled button for delivery-cost info (opens a modal in the
 * caller).
 *
 * @example
 * <PriceBlock prefix="from" amount={formatInr('2302.30')} vatNote="plus VAT at the current rate" deliveryInfo={{ label: 'Prices plus delivery costs', onClick: open }} />
 */
export interface PriceBlockProps {
  /** Renders the small grey "from" line above the amount. */
  prefix?: 'from';
  /** Pre-formatted price string, e.g. `formatInr(2302.3)` → "INR 2,302.30". */
  amount: string;
  /** `sm` = text-lg (listing rows), `lg` = text-2xl (PDP). @default 'sm' */
  size?: 'sm' | 'lg';
  /** Muted VAT/GST note below the amount. */
  vatNote?: string;
  /** Underlined delivery-cost link info. */
  deliveryInfo?: PriceBlockDeliveryInfo;
  className?: string;
}

export function PriceBlock({
  prefix,
  amount,
  size = 'sm',
  vatNote,
  deliveryInfo,
  className,
}: PriceBlockProps) {
  return (
    <div className={cn('flex flex-col items-start gap-0.5', className)}>
      {prefix === 'from' ? <span className="text-xs text-muted">from</span> : null}
      <span className={cn('font-bold text-ink', size === 'lg' ? 'text-2xl' : 'text-lg')}>
        {amount}
      </span>
      {vatNote ? <span className="text-xs text-muted">{vatNote}</span> : null}
      {deliveryInfo ? (
        <button
          type="button"
          onClick={deliveryInfo.onClick}
          className="mt-0.5 w-fit text-left text-xs text-ink underline underline-offset-2 transition-colors hover:text-brand focus-visible:outline-none"
        >
          {deliveryInfo.label}
        </button>
      ) : null}
    </div>
  );
}
