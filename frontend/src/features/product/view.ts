// Listing view preference (spec 6.3): persisted in the 'th:view' cookie,
// read server-side for the SSR default and switched client-side via
// document.cookie + router.refresh().
export type ListingView = 'list' | 'tile';

export const VIEW_COOKIE = 'th:view';

/** Parses the cookie value; anything but 'tile' falls back to the list view. */
export function parseViewCookie(value: string | undefined): ListingView {
  return value === 'tile' ? 'tile' : 'list';
}
