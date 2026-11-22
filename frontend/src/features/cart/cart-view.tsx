'use client';

// Cart page body (spec 6.6): line items with qty steppers, per-line totals and
// availability, order summary with estimated GST/shipping, warnings, CSV
// export and the guest → login → checkout hand-off.
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, Trash2 } from 'lucide-react';
import { AvailabilityDot, Button, EmptyState, QuantityStepper, Skeleton } from '@/components/ui';
import { routes } from '@/config/routes';
import { formatInr } from '@/lib/format';
import { toast } from '@/components/ui/toast-store';
import { useAuth } from '@/features/auth/auth-provider';
import { useCart, useRemoveCartItem, useUpdateCartItem } from './use-cart';
import type { CartDto, CartItemDto } from '@/shared/dto/cart.dto';

function CartLine({ item, locale }: { item: CartItemDto; locale: string }) {
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();

  return (
    <li className="grid gap-4 border-b border-line py-6 sm:grid-cols-[88px_1fr_auto]">
      <Link
        href={routes(locale).product(item.productSlug, item.articleNo)}
        aria-hidden="true"
        tabIndex={-1}
        className="relative h-24 w-24 overflow-hidden rounded-sm bg-tile"
      >
        {item.image ? (
          <Image src={item.image} alt={item.imageAlt ?? item.productName} fill sizes="96px" className="object-contain" />
        ) : null}
      </Link>
      <div className="min-w-0">
        <Link
          href={routes(locale).product(item.productSlug, item.articleNo)}
          className="font-bold text-ink hover:text-brand-hover"
        >
          {item.productName}
        </Link>
        <p className="mt-0.5 text-sm text-muted">Article no.: {item.articleNo}</p>
        <div className="mt-1.5">
          <AvailabilityDot tone={item.availability.tone} label={item.availability.label} />
        </div>
        <p className="mt-2 text-sm text-muted">
          {formatInr(item.unitPrice)} each · plus VAT at the current rate
        </p>
        <div className="mt-3 flex items-center gap-3">
          <QuantityStepper
            value={item.quantity}
            min={Math.min(item.minOrderQty, item.quantity)}
            step={item.packSize}
            size="sm"
            disabled={update.isPending}
            aria-label={`Quantity for article no. ${item.articleNo}`}
            onChange={(quantity) => update.mutate({ itemId: item.id, input: { quantity } })}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => remove.mutate(item.id)}
            aria-label={`Remove article no. ${item.articleNo} from cart`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Remove
          </Button>
        </div>
      </div>
      <div className="text-right sm:min-w-32">
        <p className="text-lg font-bold">{formatInr(item.lineTotal)}</p>
        <p className="text-xs text-muted">{item.quantity} × {formatInr(item.unitPrice)}</p>
      </div>
    </li>
  );
}

/** Client-side CSV export of the cart (articleNo;quantity;unitPrice;lineTotal). */
function exportCsv(cart: CartDto): void {
  const rows = [
    'article_no;quantity;unit_price;line_total',
    ...cart.items.map((item) => `${item.articleNo};${item.quantity};${item.unitPrice};${item.lineTotal}`),
  ];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'toolhub-cart.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function CartView({ locale }: { locale: string }) {
  const { data: cart, isLoading, error } = useCart();
  const { status } = useAuth();
  const router = useRouter();
  const [proceeding, setProceeding] = useState(false);
  const r = routes(locale);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <EmptyState title="Could not load your cart" description={error.message}>
        <Button variant="outline" onClick={() => router.refresh()}>
          Try again
        </Button>
      </EmptyState>
    );
  }
  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState
        title="Your shopping cart is empty"
        description="Browse the catalogue and add articles — your cart is saved for 60 days."
      >
        <Button href={r.home} variant="primary">
          Continue shopping
        </Button>
      </EmptyState>
    );
  }

  const proceedToCheckout = () => {
    if (status !== 'authenticated') {
      // Guest → login (the cart merges automatically after sign-in).
      router.push(r.login(r.checkout));
      return;
    }
    setProceeding(true);
    router.push(r.checkout);
  };

  return (
    <div className="grid gap-10 pb-16 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
      <div>
        <ul className="divide-y divide-line">
          {cart.items.map((item) => (
            <CartLine key={item.id} item={item} locale={locale} />
          ))}
        </ul>
        {cart.warnings.length > 0 ? (
          <ul className="mt-4 space-y-1 rounded-tile border border-stock-amber/60 bg-stock-amber/10 p-4 text-sm">
            {cart.warnings.map((warning, index) => (
              <li key={index}>{warning.message}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button href={r.home} variant="outline">
            Continue shopping
          </Button>
          <Button variant="ghost" onClick={() => exportCsv(cart)}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export cart as CSV
          </Button>
        </div>
      </div>

      <aside className="h-fit rounded-tile border border-line bg-tile p-6 lg:sticky lg:top-28">
        <h2 className="text-lg font-bold">Order summary</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal (excl. GST)</dt>
            <dd>{formatInr(cart.totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">GST {cart.totals.taxRatePercent}%</dt>
            <dd>{formatInr(cart.totals.taxTotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Delivery</dt>
            <dd>{cart.totals.shippingTotal === '0.00' ? 'Free' : formatInr(cart.totals.shippingTotal)}</dd>
          </div>
          <p className="text-xs text-muted">{cart.totals.shippingNote}</p>
          <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
            <dt>Estimated total</dt>
            <dd>{formatInr(cart.totals.grandTotal)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted">
          Prices plus delivery costs · final totals are computed at checkout.
        </p>
        <div className="mt-5">
          <Button variant="primary" size="lg" fullWidth disabled={proceeding} onClick={proceedToCheckout}>
            {status === 'authenticated' ? 'Proceed to checkout' : 'Sign in and checkout'}
          </Button>
        </div>
        {status !== 'authenticated' ? (
          <p className="mt-3 text-xs text-muted">
            Please sign in to continue to checkout — your cart will be waiting.
          </p>
        ) : null}
        <p className="mt-3 text-center text-xs">
          <Link href={r.quickOrder} className="text-link underline underline-offset-2">
            To quick entry
          </Link>
        </p>
      </aside>
    </div>
  );
}
