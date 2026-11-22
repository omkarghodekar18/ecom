'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Centered modal dialog (max-width `lg`) with a dark `bg-black/40` overlay.
 * `Esc` and overlay clicks close it (Radix defaults); focus is trapped and
 * body scroll locked while open.
 *
 * @example
 * <Modal open={open} onOpenChange={setOpen} title="Delivery costs" description="Shipping info">
 *   <p>Details…</p>
 * </Modal>
 */
export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Modal heading, rendered as the DialogTitle. */
  title: ReactNode;
  /** Secondary line under the title. */
  description?: ReactNode;
  /** Modal body. */
  children: ReactNode;
  /** Optional footer strip (e.g. action buttons) below the body. */
  footer?: ReactNode;
  /** Accessible name for the close button. @default 'Close' */
  closeLabel?: string;
  className?: string;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  closeLabel = 'Close',
  className,
}: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/40',
            'data-[state=open]:animate-[fade-in_150ms_ease-out] data-[state=closed]:animate-[fade-out_150ms_ease-in]',
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-btn bg-white shadow-xl outline-none',
            'data-[state=open]:animate-[modal-in_150ms_ease-out] data-[state=closed]:animate-[modal-out_100ms_ease-in]',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-lg font-bold text-ink">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label={closeLabel}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-btn text-muted transition-colors hover:bg-tile hover:text-ink focus-visible:outline-none"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </DialogPrimitive.Close>
          </div>
          <div className="slim-scrollbar flex-1 overflow-y-auto px-6 py-4">{children}</div>
          {footer ? (
            <div className="flex flex-wrap justify-end gap-3 border-t border-line px-6 py-4">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Trigger that opens a parent Modal — Radix `Dialog.Trigger` passthrough. */
export const ModalTrigger = DialogPrimitive.Trigger;

/** Close button for modal content — Radix `Dialog.Close` passthrough. */
export const ModalClose = DialogPrimitive.Close;
