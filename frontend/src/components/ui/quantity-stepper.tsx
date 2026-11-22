'use client';

import { Minus, Plus } from 'lucide-react';
import { useState, type FocusEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

/**
 * Controlled quantity stepper: square minus/plus buttons around a numeric
 * input that commits on blur or Enter. Values are clamped to `[min, max]`
 * and snapped to multiples of `step` counting from `min` (so `min` itself is
 * always reachable); when `max` is not a multiple, the plus button stops on
 * the largest valid value ≤ `max`.
 *
 * @example <QuantityStepper value={qty} onChange={setQty} min={1} step={5} max={50} />
 */
export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  /** Minimum quantity (the step origin). @default 1 */
  min?: number;
  /** Maximum quantity; omit for no upper bound. */
  max?: number;
  /** Step size counted from `min`. @default 1 */
  step?: number;
  disabled?: boolean;
  /** `sm` = 32px controls, `md` = 40px. @default 'md' */
  size?: 'sm' | 'md';
  /** Accessible name for the input. @default 'Quantity' */
  'aria-label'?: string;
  className?: string;
}

/** Snaps `value` to the nearest multiple of `step` counting from `min`. */
function snapToStep(value: number, min: number, step: number): number {
  const steps = Math.round((value - min) / step);
  return min + steps * step;
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
  step = 1,
  disabled = false,
  size = 'md',
  'aria-label': ariaLabel = 'Quantity',
  className,
}: QuantityStepperProps) {
  const safeStep = Math.max(1, Math.floor(step));
  const safeMin = Math.floor(min);
  // Largest valid value ≤ max (multiples of step counted from min; falls back
  // to max itself when max < min would otherwise leave nothing valid).
  const largestValid =
    max === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(safeMin, Math.min(max, safeMin + Math.floor((max - safeMin) / safeStep) * safeStep));
  const canDecrease = value - safeStep >= safeMin;
  const canIncrease = value < largestValid;

  // Draft only exists while the input is focused; otherwise the controlled
  // value is displayed directly (no state mirror, no effects).
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? String(value);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    let next: number;
    if (raw.trim() === '' || !Number.isFinite(parsed)) {
      next = value;
    } else {
      next = snapToStep(Math.floor(parsed), safeMin, safeStep);
      if (next < safeMin) next = safeMin;
      if (next > largestValid) next = largestValid;
    }
    setDraft(null);
    if (next !== value) onChange(next);
  };

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => e.target.select();

  const stepBy = (delta: number) => {
    const next = value + delta;
    if (next < safeMin || next > largestValid) return;
    onChange(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commit(draft ?? String(value));
    }
  };

  const controlSize = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('inline-flex items-stretch', disabled && 'opacity-50', className)}
    >
      <button
        type="button"
        onClick={() => stepBy(-safeStep)}
        disabled={disabled || !canDecrease}
        aria-label="Decrease quantity"
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-btn border border-line bg-white text-ink transition-colors hover:border-brand hover:text-brand focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40',
          controlSize,
        )}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={display}
        onFocus={handleFocus}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft ?? String(value))}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={ariaLabel}
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={safeMin}
        aria-valuemax={max === undefined ? undefined : largestValid}
        className={cn(
          'w-14 -mx-px border-y border-line bg-white text-center text-sm text-ink focus:outline-none disabled:cursor-not-allowed',
          size === 'sm' ? 'h-8' : 'h-10',
        )}
      />
      <button
        type="button"
        onClick={() => stepBy(safeStep)}
        disabled={disabled || !canIncrease}
        aria-label="Increase quantity"
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-btn border border-line bg-white text-ink transition-colors hover:border-brand hover:text-brand focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40',
          controlSize,
        )}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
