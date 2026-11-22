'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `value`, updating only `delayMs` after the last change. Used by the
 * header search to debounce autocomplete input (spec 6.5: 200ms).
 *
 * @example const debounced = useDebouncedValue(query, 200);
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
