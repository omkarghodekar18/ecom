// Zustand mini-store shared by the cookie banner and the footer "Cookies"
// link (spec 5.5). The decision is persisted to localStorage.
import { create } from 'zustand';

export const COOKIE_CONSENT_STORAGE_KEY = 'th:cookie-consent';

export type CookieChoice = 'all' | 'necessary';

interface CookieConsentState {
  open: boolean;
  decision: CookieChoice | null;
  hydrated: boolean;
  /** Called once on mount with the stored decision (null = undecided). */
  hydrate: (decision: CookieChoice | null) => void;
  openBanner: () => void;
  closeBanner: () => void;
  /** Store the choice and hide the banner. */
  decide: (choice: CookieChoice) => void;
}

export const useCookieConsentStore = create<CookieConsentState>((set) => ({
  open: false,
  decision: null,
  hydrated: false,
  hydrate: (decision) => set({ hydrated: true, decision, open: decision === null }),
  openBanner: () => set({ open: true }),
  closeBanner: () => set({ open: false }),
  decide: (choice) => {
    try {
      window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, choice);
    } catch {
      // Storage unavailable — keep the choice for this session only.
    }
    set({ decision: choice, open: false });
  },
}));
