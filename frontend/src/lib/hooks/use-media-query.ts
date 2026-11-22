'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * SSR-safe media query hook. The server (and hydration) snapshot is `false`,
 * so callers must treat `false` as the mobile/default layout.
 *
 * @example const isCompact = useMediaQuery('(max-width: 479px)');
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onStoreChange);
      return () => mql.removeEventListener('change', onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
