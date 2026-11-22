'use client';

import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info';

/** A toast currently managed by the store. */
export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

/** Input accepted by `push`; `id` and `variant` are optional. */
export interface ToastInput {
  /** Stable id (e.g. to deduplicate); auto-generated when omitted. */
  id?: string;
  title: string;
  description?: string;
  /** @default 'info' */
  variant?: ToastVariant;
}

interface ToastStore {
  toasts: Toast[];
  /** Adds a toast (max 4 visible, oldest dropped) with a 5s auto-dismiss. Returns the toast id. */
  push: (input: ToastInput) => string;
  /** Removes one toast by id. */
  dismiss: (id: string) => void;
}

const MAX_VISIBLE = 4;
const AUTO_DISMISS_MS = 5_000;

function createId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Global toast store. Auto-dismisses each toast after 5 seconds and keeps at
 * most 4 toasts visible (oldest are dropped first).
 *
 * @example
 * const push = useToastStore((s) => s.push);
 * push({ title: 'Added to cart', variant: 'success' });
 */
export const useToastStore = create<ToastStore>()((set, get) => ({
  toasts: [],
  push: (input) => {
    const id = input.id ?? createId();
    const toast: Toast = {
      id,
      title: input.title,
      description: input.description,
      variant: input.variant ?? 'info',
    };
    set((state) => ({ toasts: [...state.toasts, toast].slice(-MAX_VISIBLE) }));
    if (typeof window !== 'undefined') {
      window.setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS);
    }
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/**
 * Imperative helper for non-component code (API layers, event handlers).
 * Equivalent to `useToastStore.getState().push(input)`.
 */
export function toast(input: ToastInput): string {
  return useToastStore.getState().push(input);
}
