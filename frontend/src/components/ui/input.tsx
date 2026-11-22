'use client';

import { CircleAlert } from 'lucide-react';
import { useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Shared label / hint / error scaffolding used by Input, Textarea and Select.
 * Renders the label wired to the control via `htmlFor`, a muted hint line and
 * an error announcement (`role="alert"`) below the control.
 */
export interface FieldWrapperProps {
  /** Field label rendered above the control. */
  label?: ReactNode;
  /** `id` of the associated control. */
  htmlFor: string;
  /** Helper text below the control (hidden while an error is shown). */
  hint?: ReactNode;
  /** Error message, announced with `role="alert"`. */
  error?: ReactNode;
  /** Appends a red asterisk to the label (visual only). */
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FieldWrapper({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: FieldWrapperProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
          {label}
          {required ? (
            <span className="ml-0.5 text-stock-red" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {children}
      {hint && !error ? <p className="text-xs text-muted">{hint}</p> : null}
      {error ? (
        <p role="alert" className="flex items-start gap-1 text-xs font-medium text-stock-red">
          <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

const controlSizes = {
  sm: 'h-8 text-sm',
  md: 'h-10 text-sm',
  lg: 'h-12 text-base',
} as const;

const controlBase =
  'w-full rounded-btn border border-line bg-white px-3 text-ink transition-colors placeholder:text-muted focus:outline-none disabled:cursor-not-allowed disabled:bg-tile disabled:text-muted';

/**
 * Single-line text input with optional label, hint, error message and a
 * leading icon slot (e.g. a search icon inside the field).
 *
 * @example <Input label="Email" type="email" error={errors.email} leadingIcon={<Search />} />
 */
export interface InputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Icon rendered inside the field on the left. */
  leadingIcon?: ReactNode;
  /** Control size. @default 'md' */
  size?: keyof typeof controlSizes;
  /** Classes applied to the outer label/error wrapper. */
  wrapperClassName?: string;
}

export function Input({
  label,
  hint,
  error,
  leadingIcon,
  size = 'md',
  wrapperClassName,
  className,
  id,
  required,
  ...props
}: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <FieldWrapper
      label={label}
      htmlFor={inputId}
      hint={hint ? <span id={`${inputId}-hint`}>{hint}</span> : undefined}
      error={error ? <span id={`${inputId}-error`}>{error}</span> : undefined}
      required={required}
      className={wrapperClassName}
    >
      <div className="relative">
        {leadingIcon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            {leadingIcon}
          </span>
        ) : null}
        <input
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            controlBase,
            controlSizes[size],
            leadingIcon && 'pl-10',
            error && 'border-stock-red',
            className,
          )}
          {...props}
        />
      </div>
    </FieldWrapper>
  );
}

/**
 * Multi-line text area with the same label/hint/error scaffolding as Input.
 *
 * @example <Textarea label="Notes" rows={4} />
 */
export interface TextareaProps extends ComponentPropsWithoutRef<'textarea'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  wrapperClassName?: string;
}

export function Textarea({
  label,
  hint,
  error,
  wrapperClassName,
  className,
  id,
  required,
  rows = 4,
  ...props
}: TextareaProps) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  const describedBy = error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined;

  return (
    <FieldWrapper
      label={label}
      htmlFor={textareaId}
      hint={hint ? <span id={`${textareaId}-hint`}>{hint}</span> : undefined}
      error={error ? <span id={`${textareaId}-error`}>{error}</span> : undefined}
      required={required}
      className={wrapperClassName}
    >
      <textarea
        id={textareaId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          controlBase,
          'min-h-20 py-2',
          'resize-y',
          error && 'border-stock-red',
          className,
        )}
        {...props}
      />
    </FieldWrapper>
  );
}
