// Compare list (spec 6.4 "Compare products" tab): up to 4 products stored
// client-side in localStorage under "th:compare". Each entry carries the
// fields needed to render the side-by-side attribute table without refetching
// (name, brand, image link target and the tech-data snapshot of the variant
// that was on screen when the product was added).
'use client';

import { create } from 'zustand';
import type { TechDataDto } from '@/shared/dto/product.dto';

const STORAGE_KEY = 'th:compare';
export const MAX_COMPARE = 4;

export interface CompareEntry {
  id: string;
  slug: string;
  name: string;
  brandName: string;
  firstArticleNo: string;
  image: string | null;
  imageAlt: string | null;
  techData: TechDataDto[];
}

interface CompareState {
  entries: CompareEntry[];
  hydrated: boolean;
  hydrate: () => void;
  add: (entry: CompareEntry) => void;
  remove: (id: string) => void;
  clear: () => void;
}

function readStorage(): CompareEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CompareEntry[]).slice(0, MAX_COMPARE) : [];
  } catch {
    return [];
  }
}

function writeStorage(entries: CompareEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Private-mode/quota errors: the in-memory list still works this session.
  }
}

export const useCompareStore = create<CompareState>((set, get) => ({
  entries: [],
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    set({ entries: readStorage(), hydrated: true });
  },
  add: (entry) => {
    const { entries } = get();
    if (entries.some((e) => e.id === entry.id) || entries.length >= MAX_COMPARE) return;
    const next = [...entries, entry];
    writeStorage(next);
    set({ entries: next });
  },
  remove: (id) => {
    const next = get().entries.filter((e) => e.id !== id);
    writeStorage(next);
    set({ entries: next });
  },
  clear: () => {
    writeStorage([]);
    set({ entries: [] });
  },
}));
