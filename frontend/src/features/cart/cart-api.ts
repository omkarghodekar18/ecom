'use client';

// Cart API (spec Sections 9/11) — typed wrappers around the backend endpoints.
// Guests authenticate via the httpOnly th_cart cookie (sent automatically with
// credentials: 'include'); signed-in users via the bearer in authFetch — so
// every call goes through authFetch: with a stored access token it attaches
// the bearer (user cart), without it the guest cookie still applies.
import { authFetch } from '@/features/auth/with-auth-fetch';
import type {
  AddCartItemInput,
  CartDto,
  CartImportInput,
  CartImportResult,
  UpdateCartItemInput,
} from '@/shared/dto/cart.dto';
import type { QuickOrderLineResult } from '@/shared/dto/order.dto';

/** Public query key for the caller's cart. */
export const cartQueryKey = ['cart'] as const;

export const cartApi = {
  /** Current cart (guest cookie or bearer). */
  async getCart(): Promise<CartDto> {
    const { data } = await authFetch<CartDto>('/cart');
    return data;
  },

  /** Add a variant (or increase its line). */
  async addItem(input: AddCartItemInput): Promise<CartDto> {
    const { data } = await authFetch<CartDto>('/cart/items', { method: 'POST', body: input });
    return data;
  },

  /** Change quantity and/or note of one line. */
  async updateItem(itemId: string, input: UpdateCartItemInput): Promise<CartDto> {
    const { data } = await authFetch<CartDto>(`/cart/items/${itemId}`, { method: 'PATCH', body: input });
    return data;
  },

  /** Remove one line. */
  async removeItem(itemId: string): Promise<CartDto> {
    const { data } = await authFetch<CartDto>(`/cart/items/${itemId}`, { method: 'DELETE' });
    return data;
  },

  /** After login: guest cart → user cart. Called by the auth provider. */
  async merge(): Promise<CartDto | null> {
    try {
      const { data } = await authFetch<CartDto>('/cart/merge', { method: 'POST' });
      return data;
    } catch {
      return null; // merge is best-effort — login must never fail because of it
    }
  },

  /** Quick-order style import: per-line results + updated cart. */
  async importCsv(input: CartImportInput): Promise<{ cart: CartDto; results: CartImportResult[] }> {
    const { data } = await authFetch<{ cart: CartDto; results: CartImportResult[] }>(
      '/cart/import-csv',
      { method: 'POST', body: input },
    );
    return data;
  },

  /** Quick-order line validation (public). */
  async validateQuickOrder(lines: CartImportInput['lines']): Promise<QuickOrderLineResult[]> {
    const { data } = await authFetch<QuickOrderLineResult[]>('/quick-order/validate', {
      method: 'POST',
      body: { lines },
    });
    return data;
  },
};
