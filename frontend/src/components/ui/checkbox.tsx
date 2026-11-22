'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Checkbox with an orange check, an optional clickable label, a description
 * line and error text. Passes `name`/`value` through so it works in native
 * forms; `checked` accepts Radix's `'indeterminate'` state.
 *
 * @example <Checkbox label="In stock" checked={v} onCheckedChange={setV} />
 */
export interface CheckboxProps {
  /** Label text rendered next to the box (clickable). */
  label?: ReactNode;
  /** Secondary helper text below the label. */
  description?: ReactNode;
  /** Error message below the control. */
  error?: ReactNode;
  checked?: boolean | 'indeterminate';
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean | 'indeterminate') => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  /** Value submitted with the form when checked. */
  value?: string;
  id?: string;
  className?: string;
}

export function Checkbox({
  label,
  description,
  error,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  required,
  name,
  value,
  id,
  className,
}: CheckboxProps) {
  const autoId = useId();
  const boxId = id ?? autoId;
  const describedBy = error ? `${boxId}-error` : description ? `${boxId}-desc` : undefined;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-start gap-2">
        <CheckboxPrimitive.Root
          id={boxId}
          name={name}
          value={value}
          checked={checked}
          defaultChecked={defaultChecked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-btn border border-line bg-white transition-colors focus-visible:outline-none',
            'data-[state=checked]:border-brand data-[state=checked]:bg-brand',
            'data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand',
            'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
          )}
        >
          <CheckboxPrimitive.Indicator>
            {checked === 'indeterminate' ? (
              <Minus className="h-3.5 w-3.5 text-white" aria-hidden="true" />
            ) : (
              <Check className="h-3.5 w-3.5 text-white" aria-hidden="true" />
            )}
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
        {label ? (
          <div className="flex flex-col">
            <label
              htmlFor={boxId}
              className={cn(
                'cursor-pointer text-sm font-medium leading-5 text-ink',
                disabled && 'cursor-not-allowed text-muted',
              )}
            >
              {label}
            </label>
            {description ? (
              <span id={`${boxId}-desc`} className="text-xs text-muted">
                {description}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? (
        <p role="alert" id={`${boxId}-error`} className="text-xs font-medium text-stock-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
