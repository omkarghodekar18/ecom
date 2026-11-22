'use client';

// Link-style wrapper around the ui Pagination primitive for server-rendered
// listings: page changes push a `?page=` URL via the App Router so the server
// component re-renders with the new searchParams (and stays shareable).
import { useRouter } from 'next/navigation';
import { Pagination } from '@/components/ui';

export interface ListingPaginationProps {
  /** Current page (1-based). */
  page: number;
  totalPages: number;
  /** Base path without query, e.g. "/in/en/brands/garaveta". */
  basePath: string;
  /** Extra query params preserved across pagination (e.g. active sort). */
  query?: Record<string, string | undefined>;
  /** Accessible name for the nav landmark. */
  'aria-label'?: string;
}

/** Numbered pagination for listing pages (page 1 links to the bare base path). */
export function ListingPagination({
  page,
  totalPages,
  basePath,
  query,
  'aria-label': ariaLabel = 'Products pagination',
}: ListingPaginationProps) {
  const router = useRouter();
  if (totalPages <= 1) return null;

  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value) params.set(key, value);
    }
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <Pagination
      page={page}
      totalPages={totalPages}
      onChange={(next) => router.push(hrefFor(next))}
      aria-label={ariaLabel}
    />
  );
}
