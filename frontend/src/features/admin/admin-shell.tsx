'use client';

// Admin shell (spec Section 15): fixed sidebar + content area. Role-aware —
// STAFF sees catalog/content/orders; ADMIN additionally sees customers,
// settings and the audit log. The (admin) layout does the server-side auth
// guard; this shell only renders navigation for the verified session.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  Building2,
  ClipboardList,
  FileClock,
  Gauge,
  Images,
  Package,
  Settings,
  ShoppingCart,
  Tags,
  TreePine,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { brand } from '@/config/brand';
import type { MeDto } from '@/shared/dto/auth.dto';

export interface AdminShellProps {
  user: MeDto;
  children: React.ReactNode;
}

export function AdminShell({ user, children }: AdminShellProps) {
  const pathname = usePathname();
  const isAdmin = user.role === 'ADMIN';

  const sections: Array<{ heading: string; items: Array<{ href: string; label: string; icon: typeof Gauge }> }> = [
    {
      heading: 'Overview',
      items: [{ href: '/admin', label: 'Dashboard', icon: Gauge }],
    },
    {
      heading: 'Catalogue',
      items: [
        { href: '/admin/products', label: 'Products', icon: Package },
        { href: '/admin/categories', label: 'Categories', icon: TreePine },
        { href: '/admin/brands', label: 'Brands', icon: Tags },
        { href: '/admin/attributes', label: 'Attributes', icon: Boxes },
      ],
    },
    {
      heading: 'Content',
      items: [{ href: '/admin/content', label: 'Banners & pages', icon: Images }],
    },
    {
      heading: 'Commerce',
      items: [
        { href: '/admin/orders', label: 'Orders', icon: ShoppingCart },
        { href: '/admin/imports', label: 'Import Center', icon: ClipboardList },
      ],
    },
    ...(isAdmin
      ? [
          {
            heading: 'People',
            items: [
              { href: '/admin/customers', label: 'Customers & companies', icon: Users },
              { href: '/admin/audit', label: 'Audit log', icon: FileClock },
            ],
          },
          {
            heading: 'System',
            items: [{ href: '/admin/settings', label: 'Settings', icon: Settings }],
          },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-dvh bg-white">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-e border-line bg-tile lg:flex">
        <div className="border-b border-line px-4 py-4">
          <p className="text-sm font-bold text-ink">{brand.name}</p>
          <p className="text-xs text-muted">Admin panel</p>
        </div>
        <nav aria-label="Admin" className="flex-1 overflow-y-auto px-2 py-3">
          {sections.map((section) => (
            <div key={section.heading} className="mb-4">
              <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted">
                {section.heading}
              </p>
              <ul>
                {section.items.map((item) => {
                  const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(`${item.href}/`));
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2 rounded-btn px-3 py-2 text-sm font-medium transition-colors',
                          active ? 'bg-brand text-white' : 'text-ink hover:bg-white focus-visible:outline-none',
                        )}
                      >
                        <item.icon className="h-4 w-4" aria-hidden="true" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-line px-4 py-3 text-xs text-muted">
          <span className="font-bold text-ink">{user.firstName} {user.lastName}</span> · {user.role}
          <Building2 className="ms-1 inline h-3 w-3" aria-hidden="true" />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile nav: horizontal chip row */}
        <nav aria-label="Admin (mobile)" className="flex gap-2 overflow-x-auto border-b border-line px-4 py-2 lg:hidden">
          {sections.flatMap((section) => section.items).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-full border border-line px-3 py-1 text-xs font-medium text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

/** Shared page header with an optional action slot. */
export function AdminPageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-bold lg:text-2xl">{title}</h1>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export { ClipboardList };
