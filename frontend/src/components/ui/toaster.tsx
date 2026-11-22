'use client';

import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useToastStore, type ToastVariant } from './toast-store';

const variantMeta: Record<
  ToastVariant,
  { borderClass: string; iconClass: string; Icon: LucideIcon }
> = {
  success: { borderClass: 'border-l-stock-green', iconClass: 'text-stock-green', Icon: CircleCheck },
  error: { borderClass: 'border-l-stock-red', iconClass: 'text-stock-red', Icon: CircleAlert },
  info: { borderClass: 'border-l-brand', iconClass: 'text-brand', Icon: Info },
};

/**
 * Fixed bottom-right toast stack, mounted once by `Providers`. Reads the
 * global `useToastStore`; toasts slide in, keep a variant-colored left border
 * (green / red / orange) and offer a manual close button. The region is a
 * polite live status area for screen readers.
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((t) => {
        const meta = variantMeta[t.variant];
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-btn border border-line border-l-4 bg-white py-3 pl-3 pr-2 shadow-lg',
              'animate-[toast-in_200ms_ease-out]',
              meta.borderClass,
            )}
          >
            <meta.Icon className={cn('mt-0.5 h-5 w-5 shrink-0', meta.iconClass)} aria-hidden="true" />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-bold text-ink">{t.title}</p>
              {t.description ? (
                <p className="mt-0.5 text-sm leading-5 text-muted">{t.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-btn text-muted transition-colors hover:bg-tile hover:text-ink focus-visible:outline-none"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
