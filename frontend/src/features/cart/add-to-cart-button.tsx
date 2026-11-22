'use client';

// AddToCartButton: shared mutation control for the PDP buy box, sticky bar and
// single-variant listing rows. Pure client island — no props drilling of the
// cart state; the mutation updates the global ['cart'] cache.
import { useState } from 'react';
import { Button, QuantityStepper } from '@/components/ui';
import { useAddToCart } from './use-cart';

export interface AddToCartButtonProps {
  variantId: string;
  quantity: number;
  minOrderQty: number;
  packSize: number;
  /** Stepper visible (PDP) or hidden (compact rows). */
  showStepper?: boolean;
  onQuantityChange?: (qty: number) => void;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  label?: string;
}

export function AddToCartButton({
  variantId,
  quantity,
  minOrderQty,
  packSize,
  showStepper = true,
  onQuantityChange,
  size = 'lg',
  fullWidth = true,
  label = 'Add to shopping cart',
}: AddToCartButtonProps) {
  const [qty, setQty] = useState(quantity);
  const add = useAddToCart();

  const effective = onQuantityChange ? quantity : qty;
  const setQuantity = (next: number) => {
    setQty(next);
    onQuantityChange?.(next);
  };

  return (
    <div className={showStepper ? 'flex flex-col gap-3' : 'contents'}>
      {showStepper ? (
        <QuantityStepper
          value={effective}
          min={Math.max(1, minOrderQty)}
          step={Math.max(1, packSize)}
          onChange={setQuantity}
          aria-label={`Quantity (minimum ${minOrderQty}, pack of ${packSize})`}
        />
      ) : null}
      <Button
        variant="primary"
        size={size}
        fullWidth={fullWidth}
        disabled={add.isPending}
        onClick={() => add.mutate({ variantId, quantity: effective })}
      >
        {add.isPending ? 'Adding…' : label}
      </Button>
    </div>
  );
}
