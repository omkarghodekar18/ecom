'use client';

import { useCookieConsentStore } from './cookie-consent-store';

/**
 * Footer "Cookies" entry (spec 5.3): reopens the consent banner instead of
 * navigating. Rendered as an <li> inside the legal row's <ul>.
 */
export function CookieSettingsLink() {
  const openBanner = useCookieConsentStore((s) => s.openBanner);

  return (
    <li>
      <button
        type="button"
        onClick={openBanner}
        className="text-sm text-ink transition-colors hover:text-brand"
      >
        Cookies
      </button>
    </li>
  );
}
