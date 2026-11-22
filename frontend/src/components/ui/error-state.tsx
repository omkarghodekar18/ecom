'use client';

import { CircleAlert, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './button';

/**
 * Error placeholder. `variant="alert"` renders a red-tinted alert box
 * (`bg-stock-red/10` + `border-stock-red`, announced via `role="alert"`);
 * `variant="inline"` renders a compact single-line variant for tight spots.
 * Provide `onRetry` to show a retry button.
 *
 * @example
 * <ErrorState variant="alert" title="Could not load products" message={err.message} onRetry={refetch} />
 */
export interface ErrorStateProps {
  /** @default 'alert' */
  variant?: 'alert' | 'inline';
  /** @default 'Something went wrong' */
  title?: ReactNode;
  /** Supporting message below the title. */
  message?: ReactNode;
  /** Called when the retry button is activated. */
  onRetry?: () => void;
  /** @default 'Retry' */
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  variant = 'alert',
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Retry',
  className,
}: ErrorStateProps) {
  const retry =
    onRetry === undefined ? null : (
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {retryLabel}
      </Button>
    );

  if (variant === 'inline') {
    return (
      <p role="alert" className={cn('flex items-center gap-2 text-sm text-stock-red', className)}>
        <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-bold">{title}</span>
          {message ? <span className="text-ink"> — {message}</span> : null}
        </span>
        {retry}
      </p>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-btn border border-stock-red bg-stock-red/10 p-4',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-stock-red" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold text-ink">{title}</p>
          {message ? <p className="mt-0.5 text-sm leading-5 text-ink">{message}</p> : null}
        </div>
      </div>
      {retry ? <div className="pl-8">{retry}</div> : null}
    </div>
  );
}
