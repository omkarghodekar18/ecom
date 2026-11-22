'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Drawer, DrawerClose } from '@/components/ui';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { cn } from '@/lib/cn';
import { CategoryFrame, RootFrame } from './drawer-frames';
import { ROOT_FRAME, type DrawerFrame, type DrawerNode } from './drawer-model';

/** Waits out the slide-out animation before resetting the drill stack. */
const CLOSE_RESET_MS = 250;

export interface NavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Locale base path, e.g. "/in/en". */
  locale: string;
}

/**
 * Left slide-over navigation drawer (~380px, dark overlay — spec 5.2) with a
 * drilled stack of category levels. Level 1 ("Main menu") shows the cached
 * depth-2 tree; deeper levels lazy-load their children on demand. Leaf
 * categories navigate straight to the category page.
 */
export function NavDrawer({ open, onOpenChange, locale }: NavDrawerProps) {
  const [stack, setStack] = useState<DrawerFrame[]>([ROOT_FRAME]);
  // Full-width drawer on small phones (drawer opens only after hydration,
  // so no responsive flash is possible).
  const isCompact = useMediaQuery('(max-width: 479px)');

  // Reset to "Main menu" once the drawer has fully closed.
  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => setStack([ROOT_FRAME]), CLOSE_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  const handleDrill = useCallback((node: DrawerNode, basePath: string | null) => {
    const pathSlugs = node.pathSlugs ?? (basePath ? `${basePath}/${node.slug}` : node.slug);
    setStack((frames) => [
      ...frames,
      { kind: 'category', name: node.name, code: node.code, pathSlugs, children: node.children },
    ]);
  }, []);

  const handleBack = useCallback(() => {
    setStack((frames) => (frames.length > 1 ? frames.slice(0, -1) : frames));
  }, []);

  const handleNavigate = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const frameIndex = stack.length - 1;
  const frame = stack[frameIndex] ?? ROOT_FRAME;
  const parentFrame = frameIndex > 0 ? stack[frameIndex - 1] : undefined;
  const parentLabel =
    parentFrame === undefined ? '' : parentFrame.kind === 'category' ? parentFrame.name : 'Main menu';

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Main menu"
      hideHeader
      closeLabel="Close menu"
      className={cn(isCompact ? 'w-full max-w-none' : 'w-[380px]')}
    >
      {/* Orange strip with the white X close (spec 5.2). */}
      <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-end bg-brand px-2">
        <DrawerClose asChild>
          <button
            type="button"
            aria-label="Close menu"
            className="flex h-10 w-10 items-center justify-center rounded-btn text-white transition-colors hover:bg-white/10 focus-visible:outline-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </DrawerClose>
      </div>

      {frame.kind === 'root' ? (
        <RootFrame locale={locale} onDrill={handleDrill} onNavigate={handleNavigate} />
      ) : (
        <CategoryFrame
          locale={locale}
          frame={frame}
          parentLabel={parentLabel}
          onDrill={handleDrill}
          onBack={handleBack}
          onNavigate={handleNavigate}
        />
      )}
    </Drawer>
  );
}
