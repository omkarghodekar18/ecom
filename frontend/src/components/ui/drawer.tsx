'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Left slide-over drawer (~380px, full height) with a dark `bg-black/40`
 * overlay. Focus is trapped, `Esc` closes, overlay click closes and body
 * scroll is locked while open (all handled by Radix Dialog). A standard
 * header (bold title + X) is rendered unless `hideHeader` is set — use
 * `hideHeader` plus `DrawerClose` when the caller renders its own header row
 * (e.g. the navigation drawer's back-arrow rows or orange strip).
 *
 * @example
 * <Drawer open={open} onOpenChange={setOpen} title="Filters">{content}</Drawer>
 */
export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Drawer title; always announced via DialogTitle (visually hidden with hideHeader). */
  title: ReactNode;
  children: ReactNode;
  /** Omit the standard title bar so the caller can render custom chrome. */
  hideHeader?: boolean;
  /** Accessible name for the close button. @default 'Close' */
  closeLabel?: string;
  className?: string;
}

export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  hideHeader = false,
  closeLabel = 'Close',
  className,
}: DrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/40',
            'data-[state=open]:animate-[fade-in_200ms_ease-out] data-[state=closed]:animate-[fade-out_200ms_ease-in]',
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-[380px] max-w-[92vw] flex-col bg-white shadow-xl outline-none',
            'data-[state=open]:animate-[slide-in-left_250ms_ease-out] data-[state=closed]:animate-[slide-out-left_200ms_ease-in]',
            className,
          )}
        >
          {hideHeader ? (
            <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          ) : (
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <DialogPrimitive.Title className="text-base font-bold text-ink">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  aria-label={closeLabel}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-btn text-ink transition-colors hover:bg-tile focus-visible:outline-none"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </DialogPrimitive.Close>
            </div>
          )}
          <div className="slim-scrollbar flex-1 overflow-y-auto overscroll-contain">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Close button for custom drawer chrome (rendered as its child). Pair with
 * `hideHeader` when building e.g. the navigation drawer's orange strip.
 */
export const DrawerClose = DialogPrimitive.Close;
