'use client';

import { Menu } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { NavDrawer } from '@/features/navigation/nav-drawer';
import { brand } from '@/config/brand';
import { routes } from '@/config/routes';
import { HeaderActions } from './header-actions';
import { HeaderSearch } from './header-search';

export interface SiteHeaderProps {
  /** Locale base path, e.g. "/in/en". */
  locale: string;
}

/**
 * Sticky storefront header (spec 5.1): an orange bar with logo + pill search
 * (search wraps below the logo row on mobile) and a white bar with the Menu
 * button, primary text links (desktop) and the icon-over-label action cluster.
 */
export function SiteHeader({ locale }: SiteHeaderProps) {
  const r = routes(locale);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navLinks = [
    { label: 'Products', href: r.home },
    { label: 'Fields of application', href: r.cms('services-overview') },
    { label: 'Services', href: r.cms('services-overview') },
    { label: 'Guides', href: r.cms('drilling-guide') },
    { label: 'Consulting and support', href: r.contact },
    { label: 'Company', href: r.cms('about-us') },
    { label: 'Events', href: r.cms('events') },
  ];

  return (
    <header className="sticky top-0 z-30">
      {/* Orange bar: logo + large pill search (spec 5.1.1). */}
      <div className="bg-brand">
        <div className="page-container flex flex-wrap items-center gap-x-4 gap-y-2 py-2 md:h-14 md:py-0">
          <Link
            href={r.home}
            aria-label={`${brand.name} — homepage`}
            className="flex shrink-0 items-center gap-2 text-white focus-visible:outline-white"
          >
            <span
              className="flex h-10 w-10 items-center justify-center [&>svg]:h-10 [&>svg]:w-10"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: brand.logoSvg }}
            />
            <span className="text-lg font-bold leading-none">{brand.name}</span>
          </Link>
          {/* Mobile: the search wraps to its own full-width row inside the orange bar. */}
          <HeaderSearch locale={locale} className="order-last basis-full md:order-none md:basis-auto md:flex-1" />
          {/* Mobile action cluster (white); from lg it lives in the white bar. */}
          <HeaderActions locale={locale} tone="brand" className="ms-auto lg:hidden" />
        </div>
      </div>

      {/* White bar: menu trigger, primary links, action cluster (spec 5.1.2). */}
      <div className="border-b border-line bg-white shadow-sm">
        <div className="page-container flex h-16 items-center gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            className="flex h-11 shrink-0 items-center gap-2 rounded-btn px-2 text-sm font-medium text-ink transition-colors hover:bg-tile"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            Menu
          </button>
          <span className="hidden h-6 w-px shrink-0 bg-line lg:block" aria-hidden="true" />
          <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="flex h-11 items-center rounded-btn px-2.5 text-sm font-medium text-ink transition-colors hover:text-brand"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex-1" aria-hidden="true" />
          <HeaderActions locale={locale} tone="default" className="hidden lg:flex" />
        </div>
      </div>

      <NavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} locale={locale} />
    </header>
  );
}
