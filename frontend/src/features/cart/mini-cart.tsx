'use client';

// Mini-cart panel (spec 5.1.2/6.6): opens from the header cart icon — last
// items, subtotal, CTAs to the cart page and checkout.
import Image from 'next/image';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { Skeleton, Button } from '@/components/ui';
import { routes } from '@/config/routes';
import { formatInr } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useCart } from './use-cart';
import type { HeaderActionTone } from '@/components/layout/header-tone';
import { headerActionClasses } from '@/components/layout/header-tone';

export interface MiniCartProps {
  locale: string;
  tone: HeaderActionTone;
}

/** Cart trigger + panel; the badge shows the live piece count. */
export function MiniCart({ locale, tone }: MiniCartProps) {
  const { data: cart, isLoading } = useCart();
  const r = routes(locale);
  const count = cart?.itemCount ?? 0;
  const onBrand = tone === 'brand';

  return (
    <Popover>
      <PopoverTrigger
        className={headerActionClasses(tone)}
        aria-label={count > 0 ? `Shopping cart, ${count} items` : 'Shopping cart'}
      >
        <span className="relative">
          <ShoppingCart className="h-5 w-5" aria-hidden="true" />
          {count > 0 ? (
            <span
              className={cn(
                'absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none',
                onBrand ? 'bg-white text-brand' : 'bg-brand text-white',
              )}
            >
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </span>
        <span>Shopping cart</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 sm:w-96">
        <p className="border-b border-line px-4 py-3 text-sm font-bold">
          Shopping cart{count > 0 ? ` (${count})` : ''}
        </p>
        {isLoading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : count === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted">
            Your cart is empty.
            <div className="mt-4">
              <Button href={r.home} variant="outline" size="sm">
                Continue shopping
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {cart?.items.slice(0, 4).map((item) => (
                <li key={item.id} className="flex gap-3 px-4 py-3">
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-sm bg-tile">
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.imageAlt ?? item.productName}
                        fill
                        sizes="56px"
                        className="object-contain"
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.productName}</span>
                    <span className="block text-xs text-muted">Article no.: {item.articleNo}</span>
                    <span className="block text-xs">
                      {item.quantity} × {formatInr(item.unitPrice)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {count > 0 && (cart?.items.length ?? 0) > 4 ? (
              <p className="px-4 pt-2 text-xs text-muted">
                and {(cart?.items.length ?? 0) - 4} more in the cart
              </p>
            ) : null}
            <div className="space-y-3 border-t border-line px-4 py-3">
              <p className="flex items-baseline justify-between text-sm">
                <span className="text-muted">Subtotal (excl. GST)</span>
                <span className="text-base font-bold">{formatInr(cart?.totals.subtotal ?? '0.00')}</span>
              </p>
              <p className="text-xs text-muted">plus GST at the current rate · delivery at checkout</p>
              <div className="grid grid-cols-2 gap-2">
                <Button href={r.cart} variant="outline" size="sm">
                  View cart
                </Button>
                <Button href={r.checkout} variant="primary" size="sm">
                  To checkout
                </Button>
              </div>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
