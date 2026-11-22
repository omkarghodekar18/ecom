'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui';
import {
  COOKIE_CONSENT_STORAGE_KEY,
  useCookieConsentStore,
  type CookieChoice,
} from './cookie-consent-store';

export interface CookieConsentProps {
  /** Locale base path, e.g. "/in/en". */
  locale: string;
}

/**
 * Bottom cookie-consent banner (spec 5.5). Hidden once a choice was stored in
 * localStorage; the footer "Cookies" link reopens it via the shared store.
 */
export function CookieConsent({ locale }: CookieConsentProps) {
  const open = useCookieConsentStore((s) => s.open);
  const hydrated = useCookieConsentStore((s) => s.hydrated);
  const hydrate = useCookieConsentStore((s) => s.hydrate);
  const decide = useCookieConsentStore((s) => s.decide);

  // Read the stored decision once on mount (nothing renders during SSR).
  useEffect(() => {
    let stored: CookieChoice | null = null;
    try {
      const value = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
      if (value === 'all' || value === 'necessary') stored = value;
    } catch {
      // Storage unavailable — treat as undecided.
    }
    hydrate(stored);
  }, [hydrate]);

  if (!hydrated || !open) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-2xl rounded-tile border border-line bg-white p-4 shadow-xl sm:p-6"
    >
      <p className="text-sm leading-6 text-ink">
        We use cookies (including third-party cookies) to personalise content, analyse how the
        site is used and improve your shopping experience. You can change your choice at any time
        via the <span className="font-medium">Cookies</span> link in the footer.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        <Link
          href={`${locale}/e/about-us`}
          aria-label="Learn more about cookies and privacy"
          className="text-sm text-muted underline underline-offset-2 transition-colors hover:text-brand"
        >
          Learn more
        </Link>
        <Button variant="outline" size="sm" onClick={() => decide('necessary')}>
          Only necessary
        </Button>
        <Button variant="primary" size="sm" onClick={() => decide('all')}>
          Accept all
        </Button>
      </div>
    </div>
  );
}
