'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * Tabs root — Radix `Tabs.Root` passthrough. Accepts `defaultValue` or the
 * controlled `value` / `onValueChange` pair.
 */
export const Tabs = TabsPrimitive.Root;

/**
 * Horizontal tab list with a bottom border; the active tab renders a bold
 * label with the orange 2px underline (`border-brand`).
 */
export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('flex items-stretch gap-0 border-b border-line', className)}
      {...props}
    />
  );
}

/**
 * A single tab trigger. Keyboard users move between tabs with arrow keys
 * (Radix roving tabindex); the active trigger shows the orange underline.
 */
export function TabsTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        '-mb-px border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink focus-visible:outline-none',
        'data-[state=active]:border-brand data-[state=active]:font-bold data-[state=active]:text-brand',
        className,
      )}
      {...props}
    />
  );
}

/** Panel rendered for the active tab. */
export function TabsContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('focus-visible:outline-none', className)} {...props} />;
}
