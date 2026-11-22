'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, CircleHelp, Package, Phone, User } from 'lucide-react';
import { useEffect } from 'react';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { routes } from '@/config/routes';
import { CategoryIcon } from './category-icon';
import { DrawerTeasers } from './drawer-teasers';
import {
  categoryToDrawerNode,
  toDrawerNode,
  type DrawerCategoryFrame,
  type DrawerNode,
} from './drawer-model';
import { fetchCategoryChildren, fetchNavigationTree, navigationKeys } from './navigation-api';

/** Depth-2 tree + lazy children are cached for 10 minutes (spec 5.2). */
const NAV_STALE_TIME = 10 * 60_000;
const TREE_DEPTH = 2;

const categoryRowClasses =
  'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-tile';

function CategoryListSkeleton({ count, label }: { count: number; label: string }) {
  return (
    <div className="flex flex-col gap-1 p-4" role="status">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full rounded-btn" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export interface RootFrameProps {
  locale: string;
  /** Drills into a top-level category; its slug starts the path. */
  onDrill: (node: DrawerNode, basePath: string | null) => void;
  /** Closes the drawer (a link was activated). */
  onNavigate: () => void;
}

/** Level 1 "Main menu" (spec 5.2): top-level categories, teasers, service links. */
export function RootFrame({ locale, onDrill, onNavigate }: RootFrameProps) {
  const treeQuery = useQuery({
    queryKey: navigationKeys.tree(TREE_DEPTH),
    queryFn: () => fetchNavigationTree(TREE_DEPTH),
    staleTime: NAV_STALE_TIME,
  });

  const r = routes(locale);
  const secondaryLinks = [
    { label: 'Account overview', href: r.account, icon: User },
    { label: 'Orders', href: r.companyOrders, icon: Package },
    { label: 'Help/FAQ', href: r.help, icon: CircleHelp },
    { label: 'Contact', href: r.contact, icon: Phone },
  ];

  return (
    <div>
      <div className="sticky top-12 z-10 flex h-12 items-center border-b border-line bg-white px-4">
        <p className="text-base font-bold text-ink">Main menu</p>
      </div>

      {treeQuery.isPending ? (
        <CategoryListSkeleton count={8} label="Loading categories" />
      ) : treeQuery.isError ? (
        <div className="p-4">
          <ErrorState
            title="Could not load the menu"
            message="Please check your connection and try again."
            onRetry={() => void treeQuery.refetch()}
          />
        </div>
      ) : (treeQuery.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="No categories available"
          description="The product catalogue is currently unavailable."
        />
      ) : (
        <nav aria-label="Product categories">
          <ul>
            {treeQuery.data?.map((node) => (
              <li key={node.code}>
                <button
                  type="button"
                  onClick={() => onDrill(toDrawerNode(node), null)}
                  className={categoryRowClasses}
                >
                  <CategoryIcon src={node.icon} />
                  <span className="flex-1 text-sm font-medium text-ink">{node.name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <DrawerTeasers onNavigate={onNavigate} />

      <div className="mt-4 border-t border-line pt-2">
        <ul>
          {secondaryLinks.map(({ label, href, icon: Icon }) => (
            <li key={label}>
              <Link
                href={href}
                onClick={onNavigate}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-tile"
              >
                <Icon className="h-4 w-4 text-muted" aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export interface CategoryFrameProps {
  locale: string;
  frame: DrawerCategoryFrame;
  /** Label of the level the back arrow returns to ("Main menu" or a category). */
  parentLabel: string;
  onDrill: (node: DrawerNode, basePath: string | null) => void;
  onBack: () => void;
  /** Closes the drawer (a link was activated). */
  onNavigate: () => void;
}

/** Drilled category level (spec 5.2): back row, bold parent + "Show all", children. */
export function CategoryFrame({ locale, frame, parentLabel, onDrill, onBack, onNavigate }: CategoryFrameProps) {
  const router = useRouter();
  const r = routes(locale);
  const categoryHref = r.category(frame.pathSlugs, frame.code);

  const childrenQuery = useQuery({
    queryKey: navigationKeys.children(frame.code),
    queryFn: () => fetchCategoryChildren(frame.code),
    enabled: frame.children === null,
    staleTime: NAV_STALE_TIME,
  });

  const children =
    frame.children ?? (childrenQuery.data ?? []).map(categoryToDrawerNode);

  // Leaf category (lazy fetch returned no sub-categories): take the user
  // straight to the category page instead of an empty drill level.
  const isLeaf =
    frame.children === null && childrenQuery.isSuccess && children.length === 0;

  useEffect(() => {
    if (!isLeaf) return;
    onNavigate();
    router.push(categoryHref);
  }, [isLeaf, categoryHref, onNavigate, router]);

  return (
    <div>
      <div className="sticky top-12 z-10 flex h-12 items-center gap-1 border-b border-line bg-white px-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={`Back to ${parentLabel}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn text-ink transition-colors hover:bg-tile"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <p className="truncate text-base font-bold text-ink">{parentLabel}</p>
      </div>

      <div className="flex items-baseline justify-between gap-4 px-4 pb-2 pt-4">
        <p className="min-w-0 truncate text-base font-bold text-ink">{frame.name}</p>
        <Link
          href={categoryHref}
          onClick={onNavigate}
          className="shrink-0 text-sm font-bold text-brand hover:underline"
        >
          Show all
        </Link>
      </div>

      {frame.children === null && childrenQuery.isPending ? (
        <CategoryListSkeleton count={5} label="Loading sub-categories" />
      ) : frame.children === null && childrenQuery.isError ? (
        <div className="p-4">
          <ErrorState
            title="Could not load sub-categories"
            message="Please check your connection and try again."
            onRetry={() => void childrenQuery.refetch()}
          />
        </div>
      ) : (
        <nav aria-label={`Sub-categories of ${frame.name}`}>
          <ul>
            {children.map((node) => (
              <li key={node.code}>
                <button
                  type="button"
                  onClick={() => onDrill(node, frame.pathSlugs)}
                  className={categoryRowClasses}
                >
                  <CategoryIcon src={node.icon} />
                  <span className="flex-1 text-sm font-medium text-ink">{node.name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
