import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { site } from '@/config/site';
import { BreadcrumbBack } from './breadcrumb-back';

/** One breadcrumb element; `href` is omitted on the current page. */
export interface CrumbItem {
  name: string;
  href?: string;
}

function absoluteUrl(href: string): string {
  try {
    return new URL(href, site.url).toString();
  } catch {
    return href;
  }
}

/** BreadcrumbList JSON-LD for structured data (spec 5.4 / 13). */
export function buildBreadcrumbJsonLd(items: CrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.href ? { item: absoluteUrl(item.href) } : {}),
    })),
  };
}

export interface BreadcrumbsProps {
  items: CrumbItem[];
}

/**
 * Breadcrumb row (spec 5.4): orange back-arrow + "Back" (history back), a
 * thin vertical separator, then the crumbs with chevron separators. The last
 * crumb is the current page (`aria-current`, not a link). Emits a
 * `BreadcrumbList` JSON-LD script for the rendered items.
 *
 * @example <Breadcrumbs items={[{ name: 'Homepage', href: '/in/en' }, { name: 'Drilling' }]} />
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const lastIndex = items.length - 1;
  const jsonLd = JSON.stringify(buildBreadcrumbJsonLd(items)).replace(/</g, '\\u003c');

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <BreadcrumbBack fallbackHref={items[0]?.href ?? '/'} />
        <span className="h-4 w-px shrink-0 bg-line" aria-hidden="true" />
        <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {items.map((item, index) => (
            <li key={`${item.name}-${index}`} className="flex min-w-0 items-center gap-2">
              {index > 0 ? (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              ) : null}
              {index < lastIndex && item.href ? (
                <Link href={item.href} className="truncate text-muted transition-colors hover:text-brand">
                  {item.name}
                </Link>
              ) : (
                <span aria-current="page" className="truncate font-medium text-ink">
                  {item.name}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    </>
  );
}
