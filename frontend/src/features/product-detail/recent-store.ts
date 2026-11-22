// Recently viewed products (spec 6.4): client-side list in localStorage under
// "th:recent", newest first, de-duplicated by product id, capped at 12. Only
// rendered after mount (SSR-safe — the list is per-browser, never server HTML).
'use client';

import { create } from 'zustand';
import type { AvailabilityDto } from '@/shared/dto/product.dto';

const STORAGE_KEY = 'th:recent';
export const MAX_RECENT = 12;

/** Structurally a ListingProductDto, so the shared listing card can render it. */
export interface RecentEntry {
  id: string;
  slug: string;
  name: string;
  brandName: string;
  brandSlug: string;
  firstArticleNo: string;
  firstVariantId: string;
  isBestseller: boolean;
  variantCount: number;
  priceFrom: string | null;
  image: string | null;
  imageAlt: string | null;
  availability: AvailabilityDto;
}

interface RecentState {
  entries: RecentEntry[];
  hydrated: boolean;
  hydrate: () => void;
  /** Records a viewed product (moves it to the front; caps the list). */
  push: (entry: RecentEntry) => void;
  remove: (id: string) => void;
}

function readStorage(): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentEntry[]).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function writeStorage(entries: RecentEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage unavailable — keep the in-memory list for this session only.
  }
}

export const useRecentStore = create<RecentState>((set, get) => ({
  entries: [],
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    set({ entries: readStorage(), hydrated: true });
  },
  push: (entry) => {
    const next = [entry, ...get().entries.filter((e) => e.id !== entry.id)].slice(0, MAX_RECENT);
    writeStorage(next);
    set({ entries: next });
  },
  remove: (id) => {
    const next = get().entries.filter((e) => e.id !== id);
    writeStorage(next);
    set({ entries: next });
  },
}));
