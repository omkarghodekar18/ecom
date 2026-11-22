'use client';

// Large white pill search input on the orange header bar (spec 5.1/6.5).
// Submit pushes the search page; typing shows the autocomplete groups from
// GET /search/suggest (products with image + article no., categories, brands)
// with full keyboard navigation in one flat listbox.
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { routes } from '@/config/routes';
import { getSuggest } from '@/features/search/search-api';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { cn } from '@/lib/cn';

const AUTOCOMPLETE_DEBOUNCE_MS = 200;
const SEARCH_PLACEHOLDER = 'Search term, product, article no., category, EAN/GTIN, brand...';

export interface HeaderSearchProps {
  /** Locale base path, e.g. "/in/en". */
  locale: string;
  className?: string;
}

/** One navigable dropdown entry. */
interface SuggestEntry {
  id: string;
  kind: 'product' | 'category' | 'brand';
  href: string;
  label: string;
  detail?: string;
  image?: string | null;
}

export function HeaderSearch({ locale, className }: HeaderSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebouncedValue(query, AUTOCOMPLETE_DEBOUNCE_MS);

  const term = debouncedQuery.trim();
  const enabled = term.length >= 2;

  const { data, isFetching } = useQuery({
    queryKey: ['search-suggest', term],
    queryFn: () => getSuggest(term),
    enabled,
    staleTime: 60_000,
  });

  const entries = buildEntries(data, locale);
  const showDropdown = open && enabled;

  // Close on outside pointer-down (ignore clicks inside the search box).
  useEffect(() => {
    if (!showDropdown) return undefined;
    function onPointerDown(event: PointerEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showDropdown]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setOpen(false);
    router.push(`${routes(locale).search}?q=${encodeURIComponent(trimmed)}`);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (!showDropdown || entries.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % entries.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? entries.length - 1 : i - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      // Navigate the highlighted entry instead of submitting the form.
      event.preventDefault();
      const entry = entries[activeIndex];
      if (entry) {
        setOpen(false);
        router.push(entry.href);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={cn('relative min-w-0 flex-1', className)}>
      <form role="search" onSubmit={handleSubmit}>
        <label htmlFor="site-search-input" className="sr-only">
          Search products
        </label>
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          id="site-search-input"
          type="search"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="site-search-suggest"
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={SEARCH_PLACEHOLDER}
          className="h-10 w-full rounded-pill border-0 bg-white pl-11 pr-10 text-sm text-ink shadow-sm placeholder:text-muted focus:outline-none"
        />
        {enabled && isFetching ? (
          <Loader2
            className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted"
            aria-hidden="true"
          />
        ) : null}
      </form>

      {showDropdown ? (
        <div
          id="site-search-suggest"
          role="listbox"
          aria-label="Search suggestions"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-tile border border-line bg-white shadow-lg"
        >
          {entries.length === 0 ? (
            isFetching ? null : (
              <p className="px-4 py-3 text-sm text-muted">
                No suggestions for &ldquo;{term}&rdquo; — press Enter to search anyway.
              </p>
            )
          ) : (
            <>
              <SuggestGroup label="Products">
                {entries
                  .filter((e) => e.kind === 'product')
                  .map((entry) => (
                    <SuggestRow
                      key={entry.id}
                      entry={entry}
                      active={entries[activeIndex]?.id === entry.id}
                      onNavigate={() => setOpen(false)}
                    />
                  ))}
              </SuggestGroup>
              <SuggestGroup label="Categories">
                {entries
                  .filter((e) => e.kind === 'category')
                  .map((entry) => (
                    <SuggestRow
                      key={entry.id}
                      entry={entry}
                      active={entries[activeIndex]?.id === entry.id}
                      onNavigate={() => setOpen(false)}
                    />
                  ))}
              </SuggestGroup>
              <SuggestGroup label="Brands">
                {entries
                  .filter((e) => e.kind === 'brand')
                  .map((entry) => (
                    <SuggestRow
                      key={entry.id}
                      entry={entry}
                      active={entries[activeIndex]?.id === entry.id}
                      onNavigate={() => setOpen(false)}
                    />
                  ))}
              </SuggestGroup>
              <Link
                href={`${routes(locale).search}?q=${encodeURIComponent(term)}`}
                onClick={() => setOpen(false)}
                className="block border-t border-line bg-tile px-4 py-2.5 text-sm font-bold text-brand transition-colors hover:bg-brand hover:text-white"
              >
                See all results for &ldquo;{term}&rdquo;
              </Link>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SuggestGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="bg-tile px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      {children}
    </div>
  );
}

function SuggestRow({
  entry,
  active,
  onNavigate,
}: {
  entry: SuggestEntry;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={entry.href}
      role="option"
      aria-selected={active}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 px-4 py-2 text-sm text-ink transition-colors',
        active ? 'bg-brand/10' : 'hover:bg-tile',
      )}
    >
      {entry.kind === 'product' ? (
        entry.image ? (
          <Image
            src={entry.image}
            alt=""
            width={32}
            height={32}
            sizes="32px"
            className="shrink-0 rounded-btn border border-line bg-white object-contain"
          />
        ) : (
          <span className="h-8 w-8 shrink-0 rounded-btn border border-line bg-tile" aria-hidden="true" />
        )
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{entry.label}</span>
        {entry.detail ? <span className="block truncate text-xs text-muted">{entry.detail}</span> : null}
      </span>
    </Link>
  );
}

/** Flattens the suggest groups into navigable entries (products → categories → brands). */
function buildEntries(data: Awaited<ReturnType<typeof getSuggest>> | undefined, locale: string): SuggestEntry[] {
  if (!data) return [];
  const r = routes(locale);
  const products: SuggestEntry[] = data.products.map((p) => ({
    id: `p:${p.slug}`,
    kind: 'product',
    href: p.articleNo ? r.product(p.slug, p.articleNo) : `${r.search}?q=${encodeURIComponent(p.name)}`,
    label: p.name,
    detail: [p.articleNo, p.brandName].filter(Boolean).join(' · '),
    image: p.image,
  }));
  const categories: SuggestEntry[] = data.categories.map((c) => ({
    id: `c:${c.code}`,
    kind: 'category',
    href: r.category(c.pathSlugs, c.code),
    label: c.name,
  }));
  const brands: SuggestEntry[] = data.brands.map((b) => ({
    id: `b:${b.slug}`,
    kind: 'brand',
    href: r.brand(b.slug),
    label: b.name,
  }));
  return [...products, ...categories, ...brands];
}
