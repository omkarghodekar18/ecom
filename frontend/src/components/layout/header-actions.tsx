'use client';

// Right-hand "icon above label" cluster of the header (spec 5.1.2): direct
// purchase (quick-entry popover + link), country/language, sign in / account,
// shopping cart (live badge + mini-cart panel).
import { Clock } from 'lucide-react';
import { Button, Input, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { routes } from '@/config/routes';
import { cn } from '@/lib/cn';
import { useAddToCart } from '@/features/cart/use-cart';
import { toast } from '@/components/ui/toast-store';
import { MiniCart } from '@/features/cart/mini-cart';
import { HeaderAccountMenu } from './header-account-menu';
import { HeaderLocalePicker } from './header-locale-picker';
import { headerActionClasses, type HeaderActionTone } from './header-tone';
import { useState } from 'react';

export interface HeaderActionsProps {
  /** Locale base path, e.g. "/in/en". */
  locale: string;
  tone: HeaderActionTone;
  className?: string;
}

/** One quick-entry row: article number + quantity, validated and added live. */
function QuickEntryRow({ onAdded }: { onAdded: () => void }) {
  const [articleNo, setArticleNo] = useState('');
  const [quantity, setQuantity] = useState('1');
  const add = useAddToCart();
  const [resolvedVariantId, setResolvedVariantId] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = articleNo.trim();
    if (trimmed === '') return;
    try {
      // Resolve first (quick-order validate), then add via the cart API so
      // quantity rules run server-side.
      const { apiFetch } = await import('@/lib/api-client');
      const { data } = await apiFetch<
        Array<{ ok: boolean; variant: { id: string } | null; error: { message: string } | null }>
      >('/quick-order/validate', {
        method: 'POST',
        body: { lines: [{ articleNo: trimmed, quantity: Math.max(1, Number(quantity) || 1) }] },
      });
      const result = data[0];
      if (!result?.ok || !result.variant) {
        toast({ title: result?.error?.message ?? 'Article not found', variant: 'error' });
        return;
      }
      setResolvedVariantId(result.variant.id);
      add.mutate(
        { variantId: result.variant.id, quantity: Math.max(1, Number(quantity) || 1) },
        { onSuccess: () => onAdded() },
      );
      setArticleNo('');
      setQuantity('1');
    } catch (error) {
      toast({
        title: 'Could not add the article',
        description: error instanceof Error ? error.message : undefined,
        variant: 'error',
      });
    }
  };

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Input
        value={articleNo}
        onChange={(event) => {
          setArticleNo(event.target.value);
          setResolvedVariantId(null);
        }}
        placeholder="Article no., e.g. 111100 0,5"
        aria-label="Article number"
        className="h-9 flex-1"
        data-ok={resolvedVariantId !== null ? 'true' : undefined}
      />
      <Input
        value={quantity}
        onChange={(event) => setQuantity(event.target.value.replace(/[^0-9]/g, ''))}
        inputMode="numeric"
        aria-label="Quantity"
        className="h-9 w-16"
      />
      <Button type="submit" size="sm" variant="primary" disabled={add.isPending || articleNo.trim() === ''}>
        Add
      </Button>
    </form>
  );
}

/**
 * Header actions cluster. The direct-purchase popover hosts a one-line quick
 * entry (spec 5.1.2) and links the full quick-order page.
 */
export function HeaderActions({ locale, tone, className }: HeaderActionsProps) {
  const r = routes(locale);

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <Popover>
        <PopoverTrigger className={headerActionClasses(tone)} aria-label="Direct purchase — quick order">
          <Clock className="h-5 w-5" aria-hidden="true" />
          <span>Direct purchase</span>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <p className="text-sm font-bold">Quick entry</p>
          <p className="mt-1 text-xs text-muted">
            Enter an article number with quantity — availability and your price are checked live.
          </p>
          <div className="mt-3">
            <QuickEntryRow onAdded={() => undefined} />
          </div>
          <p className="mt-3 text-xs">
            <a href={r.quickOrder} className="text-brand underline underline-offset-2">
              To the full quick-order page
            </a>
          </p>
        </PopoverContent>
      </Popover>
      <HeaderLocalePicker tone={tone} />
      <HeaderAccountMenu locale={locale} tone={tone} />
      <MiniCart locale={locale} tone={tone} />
    </div>
  );
}
