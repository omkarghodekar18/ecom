'use client';

// Account-area shell: sidebar navigation (stacked on mobile) + client-side
// guest guard. Children always render; when the silent boot refresh fails the
// guard redirects to the login page with a safe `?redirect=` back here.
// (src/proxy.ts already fast-gates these paths by cookie presence.)
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Building2, LogOut, MapPin, ShieldCheck, User } from 'lucide-react';
import { routes } from '@/config/routes';
import { cn } from '@/lib/cn';
import { useAuth } from '../auth-provider';

interface AccountShellProps {
  /** Locale base, e.g. "/in/en". */
  locale: string;
  children: ReactNode;
}

export function AccountShell({ locale, children }: AccountShellProps) {
  const { status, user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const r = routes(locale);

  // Client-side re-check: guests (expired/invalid refresh cookie) go to
  // login and come back after signing in.
  useEffect(() => {
    if (status === 'guest') {
      router.replace(routes(locale).login(pathname));
    }
  }, [status, pathname, router, locale]);

  const items = [
    { href: r.account, label: 'Overview', icon: User, exact: true },
    { href: r.accountSection('profile'), label: 'Profile', icon: User, exact: false },
    { href: r.accountSection('addresses'), label: 'Addresses', icon: MapPin, exact: false },
    { href: r.accountSection('security'), label: 'Security', icon: ShieldCheck, exact: false },
    { href: `${locale}/my-company`, label: 'Company', icon: Building2, exact: false },
  ];

  const isActive = (item: (typeof items)[number]) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <div className="page-container flex min-h-dvh flex-col py-8">
      <div className="flex flex-1 flex-col gap-6 lg:flex-row">
        <nav aria-label="Account" className="lg:w-60 lg:shrink-0">
          <p className="hidden px-3 pb-2 text-xs font-bold uppercase tracking-wide text-muted lg:block">
            My account
          </p>
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
            {items.map((item) => (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={isActive(item) ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-btn px-3 py-2 text-sm font-medium transition-colors hover:bg-tile focus-visible:outline-none',
                    isActive(item) ? 'bg-tile text-brand' : 'text-ink',
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-4 hidden border-t border-line pt-4 lg:block">
            {user ? <p className="truncate px-3 pb-2 text-xs text-muted">{user.email}</p> : null}
            <button
              type="button"
              onClick={() => {
                void logout();
              }}
              className="flex w-full items-center gap-2 rounded-btn px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-tile focus-visible:outline-none"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </nav>

        <div className="min-w-0 flex-1">
          {/* Children render for both authenticated users and the brief guest
              window while the guard redirect fires; each page shows its own
              pending fallback while the boot refresh is in flight. */}
          {children}
        </div>
      </div>
    </div>
  );
}
