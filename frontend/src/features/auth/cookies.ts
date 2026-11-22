// Cookie helpers for the auth feature (client-side only). The refresh token
// (`th_rt`) and the CSRF double-submit token (`th_csrf`) are set by the
// backend on login/refresh; mutations that authenticate via cookie must echo
// the CSRF token back in the `X-CSRF-Token` header.

export const REFRESH_COOKIE = 'th_rt';
export const CSRF_COOKIE = 'th_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';

/** Reads a single cookie value from `document.cookie`; null when absent. */
export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    const raw = trimmed.slice(prefix.length);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw; // malformed encoding — use the raw value
    }
  }
  return null;
}

/** True when the browser holds a session cookie pair. `th_rt` is httpOnly and
 * invisible to JS, so the readable `th_csrf` (same lifecycle: set together on
 * login/refresh, cleared together on logout) is the boot signal. */
export function hasSessionCookie(): boolean {
  return readCookie(CSRF_COOKIE) !== null;
}

/** Double-submit CSRF header for cookie-authenticated mutations. */
export function csrfHeaders(): Record<string, string> {
  const token = readCookie(CSRF_COOKIE);
  return token ? { [CSRF_HEADER]: token } : {};
}
