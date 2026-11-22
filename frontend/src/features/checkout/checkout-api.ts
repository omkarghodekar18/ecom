'use client';

// Checkout API (spec 6.7): settings (delivery/payment options), pre-flight
// validation, placement and the Razorpay verify callback.
import { apiFetch } from '@/lib/api-client';
import { authFetch } from '@/features/auth/with-auth-fetch';
import type {
  AddressSnapshot,
  CheckoutValidateResult,
  PlaceOrderInput,
  PlaceOrderResult,
} from '@/shared/dto/order.dto';

/** Public commerce settings slice (GET /settings/commerce). */
export interface CommerceSettings {
  tax: { ratePercent: number };
  shipping: {
    flatRateInr: number;
    freeThresholdInr: number;
    note: string;
    expressRateInr: number | null;
  };
  payments: { invoice: boolean; request: boolean; razorpay: boolean; razorpayKeyId: string };
}

export const checkoutApi = {
  async getCommerceSettings(): Promise<CommerceSettings> {
    const { data } = await apiFetch<CommerceSettings>('/settings/commerce');
    return data;
  },

  async validate(input: { deliveryMethod?: 'standard' | 'express' }): Promise<CheckoutValidateResult> {
    const { data } = await authFetch<CheckoutValidateResult>('/checkout/validate', {
      method: 'POST',
      body: input,
    });
    return data;
  },

  async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const { data } = await authFetch<PlaceOrderResult>('/checkout/place-order', {
      method: 'POST',
      body: input,
    });
    return data;
  },

  async verifyRazorpay(input: {
    orderNo: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    signature: string;
  }): Promise<void> {
    await authFetch('/checkout/payments/razorpay/verify', { method: 'POST', body: input });
  },
};

export type { AddressSnapshot };
