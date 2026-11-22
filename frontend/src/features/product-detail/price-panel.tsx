'use client';

// Price block of the buy box (spec 6.4): big net price, "Price per 1 Piece",
// VAT note, underlined "Prices plus delivery costs" (shipping modal).
// Guests additionally get the teal-bold B2B hint with an underlined login
// link; logged-in users see the resolved unit price (list price struck
// through when different) and the quantity price-tier table when defined.
import Link from 'next/link';
import { useState } from 'react';
import { PriceBlock, Skeleton, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui';
import { routes } from '@/config/routes';
import { site } from '@/config/site';
import { useAuth } from '@/features/auth/auth-provider';
import { formatInr } from '@/lib/format';
import { ShippingInfoModal } from '@/features/product/shipping-info-modal';
import type { ResolvedPriceDto, VariantDto } from '@/shared/dto/product.dto';

export interface PricePanelProps {
  variant: VariantDto;
  resolved: ResolvedPriceDto | undefined;
  isResolving: boolean;
  locale: string;
}

/** Quantity price tiers ("from 10 → INR 150.94" rows), spec 6.4. */
function TierTable({ variant }: { variant: VariantDto }) {
  if (variant.priceTiers.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-sm font-bold text-ink">Quantity prices</p>
      <table className="mt-1.5 w-full max-w-sm text-sm">
        <caption className="sr-only">Quantity price tiers for {variant.articleNo}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-1.5 pr-4 font-medium">
              From quantity
            </th>
            <th scope="col" className="py-1.5 font-medium">
              Price per {variant.unitLabel.toLowerCase()}
            </th>
          </tr>
        </thead>
        <tbody>
          {variant.priceTiers.map((tier) => (
            <tr key={tier.minQty} className="border-b border-line last:border-b-0">
              <td className="py-1.5 pr-4 text-ink">{tier.minQty}</td>
              <td className="py-1.5 font-bold text-ink">{formatInr(tier.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PricePanel({ variant, resolved, isResolving, locale }: PricePanelProps) {
  const [shippingOpen, setShippingOpen] = useState(false);
  const { status } = useAuth();
  const authenticated = status === 'authenticated';

  // Effective price line: guests → list price; logged-in → resolved unit price
  // with the list price struck through when the two differ.
  const effectivePrice = authenticated && resolved ? resolved.unitPrice : variant.listPrice;
  const showStruckList =
    authenticated && resolved !== undefined && resolved.unitPrice !== resolved.listPrice;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {isResolving ? (
          <Skeleton className="h-8 w-40" />
        ) : (
          <PriceBlock amount={formatInr(effectivePrice)} size="lg" />
        )}
        {showStruckList && resolved ? (
          <span className="text-sm text-muted line-through">{formatInr(resolved.listPrice)}</span>
        ) : null}
        {resolved?.basis === 'customer' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help text-xs font-medium text-teal">Your price</span>
            </TooltipTrigger>
            <TooltipContent>Individual customer price for your company</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-muted">
        Price per {variant.priceUnit} {variant.unitLabel}
      </p>
      <p className="text-xs text-muted">{site.copy.vatNote}</p>
      <button
        type="button"
        onClick={() => setShippingOpen(true)}
        className="mt-0.5 text-left text-xs text-ink underline underline-offset-2 transition-colors hover:text-brand focus-visible:outline-none"
      >
        {site.copy.deliveryNote}
      </button>
      <ShippingInfoModal open={shippingOpen} onOpenChange={setShippingOpen} />

      {!authenticated ? (
        <p className="mt-3 text-sm font-bold text-teal">
          Individual prices for business customers after{' '}
          <Link
            href={routes(locale).login(
              typeof window === 'undefined' ? undefined : window.location.pathname + window.location.search,
            )}
            className="underline underline-offset-2"
          >
            login
          </Link>
          .
        </p>
      ) : null}

      <TierTable variant={variant} />
    </div>
  );
}
