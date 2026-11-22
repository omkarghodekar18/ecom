'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { FieldWrapper } from './input';

/** One selectable option. Radix Select requires non-empty string values. */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Select dropdown styled to match the Input control: bordered trigger with a
 * chevron, white popper list, orange bold highlight on the selected item.
 * Controlled via `value` / `onValueChange`.
 *
 * @example
 * <Select label="Sorting" options={[{ value: 'relevance', label: 'Relevance' }]} value={v} onValueChange={setV} />
 */
export interface SelectProps {
  /** Available options. */
  options: SelectOption[];
  /** Field label rendered above the trigger. */
  label?: ReactNode;
  /** Helper text below the trigger. */
  hint?: ReactNode;
  /** Error message; also switches the trigger border to red. */
  error?: ReactNode;
  /** Text shown while no value is selected. */
  placeholder?: string;
  /** Controlled value (`''`/`undefined` shows the placeholder). */
  value?: string;
  /** Initial value for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  /** Trigger size, matching Input sizes. @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const triggerSizes = {
  sm: 'h-8 text-sm',
  md: 'h-10 text-sm',
  lg: 'h-12 text-base',
} as const;

export function Select({
  options,
  label,
  hint,
  error,
  placeholder,
  value,
  defaultValue,
  onValueChange,
  disabled,
  required,
  name,
  id,
  size = 'md',
  className,
}: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const describedBy = error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined;

  return (
    <FieldWrapper
      label={label}
      htmlFor={selectId}
      hint={hint ? <span id={`${selectId}-hint`}>{hint}</span> : undefined}
      error={error ? <span id={`${selectId}-error`}>{error}</span> : undefined}
      required={required}
      className={className}
    >
      <SelectPrimitive.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        name={name}
        disabled={disabled}
        required={required}
      >
        <SelectPrimitive.Trigger
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-btn border border-line bg-white px-3 text-ink transition-colors focus:outline-none disabled:cursor-not-allowed disabled:bg-tile disabled:text-muted',
            'data-[placeholder]:text-muted',
            triggerSizes[size],
            error && 'border-stock-red',
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder ?? 'Please select…'} />
          <SelectPrimitive.Icon>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className={cn(
              'z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-btn border border-line bg-white shadow-lg',
              'data-[state=open]:animate-[fade-in_120ms_ease-out]',
            )}
          >
            <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-muted">
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="h-[var(--radix-select-content-available-height)] p-1">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-2 rounded-btn px-3 py-2 text-sm text-ink outline-none',
                    'data-[highlighted]:bg-tile',
                    'data-[state=checked]:font-bold data-[state=checked]:text-brand',
                    'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
                  )}
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4 text-brand" aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-muted">
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </FieldWrapper>
  );
}
