'use client';

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** One radio option; the label is rendered next to the circle. */
export interface RadioOption {
  value: string;
  label: ReactNode;
  /** Secondary helper text below the label. */
  description?: ReactNode;
  disabled?: boolean;
}

/**
 * Radio group with an orange dot indicator and a label per item. Supports
 * vertical (default) and horizontal layouts and is controlled via
 * `value` / `onValueChange`.
 *
 * @example
 * <RadioGroup legend="Delivery method" orientation="vertical" options={options} value={v} onValueChange={setV} />
 */
export interface RadioGroupProps {
  /** Options to render, one radio per entry. */
  options: RadioOption[];
  /** Group label announced as the radiogroup name. */
  label?: ReactNode;
  /** Helper text below the group. */
  hint?: ReactNode;
  /** Error message below the group. */
  error?: ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  /** Layout direction. @default 'vertical' */
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

export function RadioGroup({
  options,
  label,
  hint,
  error,
  value,
  defaultValue,
  onValueChange,
  name,
  disabled,
  orientation = 'vertical',
  className,
}: RadioGroupProps) {
  const autoId = useId();
  const groupId = autoId;
  const describedBy = error ? `${groupId}-error` : hint ? `${groupId}-hint` : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? <span className="text-sm font-medium text-ink">{label}</span> : null}
      <RadioGroupPrimitive.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        name={name}
        disabled={disabled}
        orientation={orientation}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          orientation === 'vertical' ? 'flex flex-col gap-3' : 'flex flex-wrap gap-x-6 gap-y-3',
        )}
      >
        {options.map((option) => {
          const itemId = `${groupId}-${option.value}`;
          return (
            <div key={option.value} className="flex items-start gap-2">
              <RadioGroupPrimitive.Item
                value={option.value}
                id={itemId}
                disabled={option.disabled}
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-white transition-colors focus-visible:outline-none',
                  'data-[state=checked]:border-brand',
                  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
                )}
              >
                <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand" />
                </RadioGroupPrimitive.Indicator>
              </RadioGroupPrimitive.Item>
              <label
                htmlFor={itemId}
                className={cn(
                  'cursor-pointer text-sm font-medium leading-5 text-ink',
                  option.disabled && 'cursor-not-allowed text-muted',
                )}
              >
                {option.label}
                {option.description ? (
                  <span className="block text-xs font-normal text-muted">{option.description}</span>
                ) : null}
              </label>
            </div>
          );
        })}
      </RadioGroupPrimitive.Root>
      {hint && !error ? (
        <p id={`${groupId}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p role="alert" id={`${groupId}-error`} className="text-xs font-medium text-stock-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
