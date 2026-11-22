'use client';

import { LogOut, Package, User } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-provider';
import { routes } from '@/config/routes';
import { headerActionClasses, type HeaderActionTone } from './header-tone';

export interface HeaderAccountMenuProps {
  /** Locale base path, e.g. "/in/en". */
  locale: string;
  tone: HeaderActionTone;
}

const menuLinkClasses =
  'flex items-center gap-2 rounded-btn px-2 py-2 text-sm font-medium text-ink transition-colors hover:bg-tile';

/**
 * "Sign in" entry (spec 5.1.2): a plain login link for guests; an account
 * popover (My account / Orders / Sign out) once useAuth reports a session.
 */
export function HeaderAccountMenu({ locale, tone }: HeaderAccountMenuProps) {
  const { status, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const r = routes(locale);

  if (status !== 'authenticated') {
    return (
      <Link href={r.login()} className={headerActionClasses(tone)}>
        <User className="h-5 w-5" aria-hidden="true" />
        <span>Sign in</span>
      </Link>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={headerActionClasses(tone)}>
          <User className="h-5 w-5" aria-hidden="true" />
          <span>My account</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <p className="truncate px-2 py-1.5 text-xs text-muted">{user?.email}</p>
        <div className="my-1 h-px bg-line" aria-hidden="true" />
        <Link href={r.account} onClick={() => setOpen(false)} className={menuLinkClasses}>
          <User className="h-4 w-4 text-muted" aria-hidden="true" />
          My account
        </Link>
        <Link href={r.companyOrders} onClick={() => setOpen(false)} className={menuLinkClasses}>
          <Package className="h-4 w-4 text-muted" aria-hidden="true" />
          Orders
        </Link>
        <div className="my-1 h-px bg-line" aria-hidden="true" />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            void logout();
          }}
          className={`${menuLinkClasses} w-full text-left`}
        >
          <LogOut className="h-4 w-4 text-muted" aria-hidden="true" />
          Sign out
        </button>
      </PopoverContent>
    </Popover>
  );
}
