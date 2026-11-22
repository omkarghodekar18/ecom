'use client';

import { Check, Globe } from 'lucide-react';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { headerActionClasses, type HeaderActionTone } from './header-tone';

interface LocaleOption {
  label: string;
  active: boolean;
}

/** Only India / English is active today (config: site.countries). */
const LOCALE_OPTIONS: LocaleOption[] = [
  { label: 'India / English', active: true },
  { label: 'Germany / German', active: false },
  { label: 'United States / English', active: false },
];

export interface HeaderLocalePickerProps {
  tone: HeaderActionTone;
}

/** Country / language picker behind the "IN (en)" header entry (spec 5.1.2). */
export function HeaderLocalePicker({ tone }: HeaderLocalePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={headerActionClasses(tone)}>
          <Globe className="h-5 w-5" aria-hidden="true" />
          <span>IN (en)</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <p className="px-2 pb-1 pt-0.5 text-xs font-bold uppercase tracking-wide text-muted">
          Country / Language
        </p>
        <ul>
          {LOCALE_OPTIONS.map((option) => (
            <li key={option.label}>
              {option.active ? (
                <span className="flex items-center justify-between rounded-btn bg-tile px-3 py-2 text-sm font-bold text-ink">
                  {option.label}
                  <Check className="h-4 w-4 text-brand" aria-hidden="true" />
                </span>
              ) : (
                <span
                  className="flex items-center justify-between rounded-btn px-3 py-2 text-sm text-muted"
                  aria-disabled="true"
                >
                  {option.label}
                  <span className="text-xs">Coming soon</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
