'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * Tooltip root. Embeds its own provider with a small 150ms show delay, so
 * `<Tooltip>` / `<TooltipTrigger>` / `<TooltipContent>` work anywhere without
 * a global provider. Wrap multiple tooltips in `TooltipProvider` yourself if
 * you want a shared skip-delay between them.
 */
export function Tooltip({
  children,
  delayDuration,
  ...props
}: ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipPrimitive.Provider delayDuration={150} skipDelayDuration={300}>
      <TooltipPrimitive.Root delayDuration={delayDuration} {...props}>
        {children}
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

/** Optional shared provider (groups tooltips for the skip-delay behaviour). */
export function TooltipProvider({
  children,
  ...props
}: ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider {...props}>{children}</TooltipPrimitive.Provider>;
}

/** The element that anchors the tooltip; use `asChild` to wrap a custom trigger. */
export const TooltipTrigger = TooltipPrimitive.Trigger;

/** Dark tooltip bubble rendered in a portal. */
export function TooltipContent({
  className,
  sideOffset = 4,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-w-64 rounded-btn bg-ink px-2.5 py-1.5 text-xs font-medium leading-4 text-white shadow-md',
          'data-[state=delayed-open]:animate-[fade-in_120ms_ease-out] data-[state=instant-open]:animate-[fade-in_120ms_ease-out]',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
