'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import { X } from 'lucide-react';
import { useState, useSyncExternalStore, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Popover root — Radix `Popover.Root` passthrough (controlled or uncontrolled). */
export const Popover = PopoverPrimitive.Root;

/** Anchor element; use `asChild` to attach the popover to a custom trigger. */
export const PopoverTrigger = PopoverPrimitive.Trigger;

/** Optional explicit close button for popover content. */
export const PopoverClose = PopoverPrimitive.Close;

/** White bordered popover panel rendered in a portal. */
export function PopoverContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-72 rounded-btn border border-line bg-white p-4 shadow-lg outline-none',
          'data-[state=open]:animate-[fade-in_120ms_ease-out]',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

/** localStorage key prefix for remembered dismissals. */
const DISMISSED_PREFIX = 'th:dismissed:';

const subscribeToStorage = (onStoreChange: () => void): (() => void) => {
  window.addEventListener('storage', onStoreChange);
  return () => window.removeEventListener('storage', onStoreChange);
};

/** Reads remembered dismissals without effects (hydration-safe via server snapshot). */
function useRememberedDismissal(key?: string): boolean {
  const snapshot = () => {
    if (!key) return false;
    try {
      return window.localStorage.getItem(DISMISSED_PREFIX + key) === '1';
    } catch {
      return false;
    }
  };
  return useSyncExternalStore(
    subscribeToStorage,
    snapshot,
    () => false, // server snapshot: never dismissed during SSR
  );
}

/**
 * Orange-bordered dismissible callout with a bold prefix ("New:" by default),
 * used e.g. for "New: Search the filters now." on listing pages. When
 * `dismissKey` is set, a dismissal is remembered in localStorage under
 * `th:dismissed:${dismissKey}` and the callout is not rendered again for that
 * key. Without a `dismissKey` the dismissal only lasts for the session.
 *
 * @example <DismissiblePopover dismissKey="filters-search-hint">Search the filters now.</DismissiblePopover>
 */
export interface DismissiblePopoverProps {
  /** Callout body, rendered after the bold prefix. */
  children: ReactNode;
  /** Bold prefix before the body. @default 'New:' */
  prefix?: string;
  /** Remember dismissal in localStorage under `th:dismissed:${dismissKey}`. */
  dismissKey?: string;
  /** Called after the callout has been dismissed. */
  onDismiss?: () => void;
  className?: string;
}

export function DismissiblePopover({
  children,
  prefix = 'New:',
  dismissKey,
  onDismiss,
  className,
}: DismissiblePopoverProps) {
  const [hiddenThisSession, setHiddenThisSession] = useState(false);
  const remembered = useRememberedDismissal(dismissKey);

  if (hiddenThisSession || remembered) return null;

  const handleDismiss = () => {
    setHiddenThisSession(true);
    if (dismissKey) {
      try {
        window.localStorage.setItem(DISMISSED_PREFIX + dismissKey, '1');
      } catch {
        // Storage unavailable — dismissal only applies to this session.
      }
    }
    onDismiss?.();
  };

  return (
    <div
      role="status"
      className={cn(
        'flex w-fit max-w-full items-start gap-2 rounded-btn border border-brand bg-white px-3 py-2 text-sm text-ink shadow-sm',
        className,
      )}
    >
      <p className="min-w-0">
        <span className="font-bold">{prefix}</span> {children}
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss notification"
        className="ml-1 mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-tile hover:text-ink focus-visible:outline-none"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
