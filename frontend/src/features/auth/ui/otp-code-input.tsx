'use client';

// 6-digit OTP code input: six single-character boxes with auto-advance,
// backspace-to-previous, arrow-key navigation and full-code paste support.
import { useId, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

const CODE_LENGTH = 6;

function charAt(value: string, index: number): string {
  const ch = value[index];
  return ch !== undefined && ch !== ' ' ? ch : '';
}

/** Writes `char` at `index`, keeping inner gaps as spaces (trimmed at the end). */
function withChar(value: string, index: number, char: string): string {
  const chars = value.padEnd(CODE_LENGTH, ' ').split('');
  if (index >= 0 && index < CODE_LENGTH) chars[index] = char;
  return chars.join('').replace(/ +$/, '');
}

export interface OtpCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name for the group (also used per-digit labels). */
  label: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export function OtpCodeInput({
  value,
  onChange,
  label,
  disabled,
  autoFocus,
  className,
}: OtpCodeInputProps) {
  const baseId = useId();
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const focusBox = (index: number) => {
    refs.current[index]?.focus();
  };

  const handleChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 0) {
      onChange(withChar(value, index, ''));
      return;
    }
    if (digits.length === 1) {
      onChange(withChar(value, index, digits));
      if (index < CODE_LENGTH - 1) focusBox(index + 1);
      return;
    }
    // Paste: distribute the digits from the current box onwards.
    let next = value;
    for (let i = 0; i < digits.length && index + i < CODE_LENGTH; i++) {
      next = withChar(next, index + i, digits[i] ?? '');
    }
    onChange(next);
    focusBox(Math.min(index + digits.length, CODE_LENGTH) - 1);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && charAt(value, index) === '' && index > 0) {
      event.preventDefault();
      focusBox(index - 1);
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      focusBox(index - 1);
    } else if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      event.preventDefault();
      focusBox(index + 1);
    }
  };

  return (
    <div role="group" aria-label={label} className={cn('flex gap-2', className)}>
      {Array.from({ length: CODE_LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          id={`${baseId}-${index}`}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          aria-label={`${label}, digit ${index + 1}`}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          value={charAt(value, index)}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onFocus={(e) => e.target.select()}
          className="h-12 w-11 rounded-btn border border-line bg-white text-center text-lg font-bold text-ink transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-tile disabled:text-muted"
        />
      ))}
    </div>
  );
}
