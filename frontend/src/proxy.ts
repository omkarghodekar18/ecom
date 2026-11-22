// Next.js 16 proxy (formerly middleware): locale redirect + auth route guards.
// Cookie presence is checked here as a fast gate; the real session check
// happens server-side in layouts/actions (never trust the edge alone).
import { NextResponse, type NextRequest } from 'next/server';

const DEFAULT_COUNTRY = 'in';
const DEFAULT_LANG = 'en';
const PROTECTED_PREFIXES = ['/in/en/my-account', '/in/en/my-company', '/in/en/checkout'];
const ADMIN_PREFIX = '/admin';
const REFRESH_COOKIE = 'th_rt';

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Root → default locale (Section 7).
  if (pathname === '/') {
    return NextResponse.redirect(new URL(`/${DEFAULT_COUNTRY}/${DEFAULT_LANG}`, request.url));
  }

  // 2. Locale-less storefront paths get the default prefix.
  if (
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/admin') &&
    !pathname.startsWith('/_next') &&
    !/^\/[a-z]{2}\/[a-z]{2}(\/|$)/.test(pathname) &&
    !pathname.includes('.')
  ) {
    return NextResponse.redirect(new URL(`/${DEFAULT_COUNTRY}/${DEFAULT_LANG}${pathname}${search}`, request.url));
  }

  // 3. Auth-gated areas (fast cookie gate only; server verifies the session).
  const needsAuth =
    PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) ||
    (pathname.startsWith(ADMIN_PREFIX) && !pathname.startsWith(`${ADMIN_PREFIX}/login`));
  if (needsAuth && !request.cookies.get(REFRESH_COOKIE)) {
    // Both admin and storefront gate to the (only) login page — /admin has
    // no separate login route; the redirect param returns afterwards.
    const login = new URL('/in/en/login', request.url);
    login.searchParams.set('redirect', pathname + search);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
