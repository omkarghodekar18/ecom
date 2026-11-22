/**
 * Validates a `?redirect=` target against open-redirect attacks (spec 6.8).
 * Only same-origin app paths pass: a single leading `/`, no protocol-relative
 * (`//`) or backslash (`/\`) tricks, and no scheme separator (`:`) before the
 * first `?` (a colon inside the query string is harmless).
 */

/** Fallback for unsafe targets: the default locale home. */
export const DEFAULT_REDIRECT = '/in/en';

/** Fallback when no redirect was requested at all: the site root. */
const HOME = '/';

export function safeRedirect(raw: string | undefined): string {
  const candidate = typeof raw === 'string' ? raw.trim() : '';
  if (candidate.length === 0) return HOME;

  const beforeQuery = candidate.split('?', 1)[0] ?? '';
  const isSafeInternalPath =
    candidate.startsWith('/') &&
    !candidate.startsWith('//') &&
    !candidate.startsWith('/\\') &&
    !beforeQuery.includes(':');

  return isSafeInternalPath ? candidate : DEFAULT_REDIRECT;
}
