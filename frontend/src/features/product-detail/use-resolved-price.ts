'use client';

// Live price resolution for logged-in users (spec 6.4): POST /pricing/resolve
// with the selected variant + quantity (debounced 300ms). Guests never call
// it — they see the static list price plus the B2B login hint. TanStack Query
// dedupes/caches per (variant, qty); `authFetch` attaches the bearer token
// (customer prices) with a silent refresh retry.
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/auth-provider';
import { authFetch } from '@/features/auth/with-auth-fetch';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import type { ResolvedPriceDto, VariantDto } from '@/shared/dto/product.dto';

export interface ResolvedPriceState {
  /** Backend-resolved unit price (undefined for guests / while loading). */
  resolved: ResolvedPriceDto | undefined;
  isResolving: boolean;
}

export function useResolvedPrice(variant: VariantDto | undefined, quantity: number): ResolvedPriceState {
  const { status } = useAuth();
  const debouncedQty = useDebouncedValue(quantity, 300);
  const authenticated = status === 'authenticated';
  const variantId = variant?.id;

  const query = useQuery({
    queryKey: ['pricing', 'resolve', variantId ?? 'none', debouncedQty],
    enabled: authenticated && variantId !== undefined,
    staleTime: 60_000,
    queryFn: async (): Promise<ResolvedPriceDto | undefined> => {
      if (!variantId) return undefined;
      const { data } = await authFetch<ResolvedPriceDto[]>('/pricing/resolve', {
        method: 'POST',
        body: { lines: [{ variantId, quantity: debouncedQty }] },
      });
      return data[0];
    },
  });

  return {
    resolved: authenticated ? query.data : undefined,
    isResolving: authenticated && query.isPending,
  };
}
