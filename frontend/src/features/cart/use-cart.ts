'use client';

// useCart: the single TanStack Query binding for the cart. Every mutation
// writes the response straight into the cache (the backend returns the full
// cart) and invalidates so badges everywhere stay in sync.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/toast-store';
import { useAuth } from '@/features/auth/auth-provider';
import { cartApi, cartQueryKey } from './cart-api';
import type { AddCartItemInput, CartDto, UpdateCartItemInput } from '@/shared/dto/cart.dto';

/** Shows quantity/stock adjustments the server applied. */
export function announceWarnings(cart: CartDto): void {
  for (const warning of cart.warnings.slice(0, 3)) {
    toast({ title: warning.message, variant: 'info' });
  }
}

export function useCart() {
  // Wait for the silent boot refresh: the access token lives in memory, so a
  // query firing during 'loading' would fetch as guest and show an empty cart
  // to a signed-in user right after a full page load.
  const { status } = useAuth();
  return useQuery({
    queryKey: cartQueryKey,
    queryFn: cartApi.getCart,
    staleTime: 15_000,
    enabled: status !== 'loading',
  });
}

export function useAddToCart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddCartItemInput) => cartApi.addItem(input),
    onSuccess: (cart) => {
      queryClient.setQueryData(cartQueryKey, cart);
      void queryClient.invalidateQueries({ queryKey: cartQueryKey });
      announceWarnings(cart);
      toast({ title: 'Added to shopping cart', variant: 'success' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not add to cart', description: error.message, variant: 'error' });
    },
  });
}

export function useUpdateCartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: UpdateCartItemInput }) =>
      cartApi.updateItem(itemId, input),
    onSuccess: (cart) => {
      queryClient.setQueryData(cartQueryKey, cart);
      announceWarnings(cart);
    },
    onError: (error: Error) => {
      toast({ title: 'Could not update the item', description: error.message, variant: 'error' });
    },
  });
}

export function useRemoveCartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => cartApi.removeItem(itemId),
    onSuccess: (cart) => {
      queryClient.setQueryData(cartQueryKey, cart);
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove the item', description: error.message, variant: 'error' });
    },
  });
}
