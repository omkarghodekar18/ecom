'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui';
import { apiFetch } from '@/lib/api-client';
import { navigationKeys } from './navigation-api';

/**
 * MENU_TEASER banner (admin-managed promo card in the nav drawer, spec 5.2).
 * The banners endpoint arrives with the CMS phase; until then the section
 * stays hidden (never blocks or breaks the drawer).
 */
export interface BannerDto {
  eyebrow: string | null;
  heading: string;
  subheading: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  image: string | null;
  sortOrder: number;
}

async function fetchMenuTeasers(): Promise<BannerDto[]> {
  const res = await apiFetch<BannerDto[]>('/banners', { query: { placement: 'MENU_TEASER' } });
  return res.data;
}

export interface DrawerTeasersProps {
  /** Closes the drawer after a teaser link was activated. */
  onNavigate: () => void;
}

/** Promo teaser cards below the category list (spec 5.2), hidden when empty. */
export function DrawerTeasers({ onNavigate }: DrawerTeasersProps) {
  const query = useQuery({
    queryKey: navigationKeys.teasers,
    queryFn: fetchMenuTeasers,
    staleTime: 10 * 60_000,
    retry: false, // optional decoration — never retry or surface an error
  });

  if (query.isPending) {
    return (
      <div className="mt-4 border-t border-line px-4 pt-4" role="status">
        <Skeleton className="h-10 w-24 rounded-btn" />
        <Skeleton className="mt-3 h-40 w-full rounded-tile" />
        <span className="sr-only">Loading promotions</span>
      </div>
    );
  }

  const banners = [...(query.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  if (banners.length === 0) return null; // empty or unavailable — hidden gracefully

  return (
    <div className="mt-4 border-t border-line px-4 pt-4">
      <ul className="flex flex-col gap-3">
        {banners.map((banner) => {
          const body = (
            <>
              {banner.image ? (
                <span className="relative block aspect-[16/9] bg-tile">
                  <Image
                    src={banner.image}
                    alt=""
                    fill
                    sizes="(max-width: 480px) 92vw, 348px"
                    className="object-cover"
                  />
                </span>
              ) : null}
              <span className="block p-3">
                {banner.eyebrow ? (
                  <span className="text-xs font-bold uppercase tracking-wide text-brand">
                    {banner.eyebrow}
                  </span>
                ) : null}
                <span className="mt-0.5 block text-sm font-bold text-ink">{banner.heading}</span>
                {banner.subheading ? (
                  <span className="mt-1 block text-xs leading-5 text-muted">{banner.subheading}</span>
                ) : null}
                <span className="mt-2 inline-block text-xs font-medium text-brand underline underline-offset-2">
                  {banner.ctaLabel ?? 'Find out more'}
                </span>
              </span>
            </>
          );

          return (
            <li key={banner.heading}>
              {banner.ctaHref ? (
                <Link
                  href={banner.ctaHref}
                  onClick={onNavigate}
                  className="block overflow-hidden rounded-tile border border-line bg-white transition-colors hover:border-brand"
                >
                  {body}
                </Link>
              ) : (
                <div className="overflow-hidden rounded-tile border border-line bg-white">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
