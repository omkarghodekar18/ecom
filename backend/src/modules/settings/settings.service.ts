// Settings module — public commerce settings for the storefront (checkout UI
// needs tax rate, delivery methods, payment availability). Admin updates live
// in the admin surface (Phase 7) and reuse the settingsService directly.
import { z } from 'zod';
import { getEnv } from '../../config/env.js';
import { settingsService } from '../../services/settings/index.js';
import { getPaymentProvider } from '../checkout/index.js';

/** The storefront-facing slice of the settings (no secrets, no flags beyond
 * the customer-visible razorpay toggle). */
export const CommerceSettingsDtoSchema = z.object({
  tax: z.object({ ratePercent: z.number() }),
  shipping: z.object({
    flatRateInr: z.number(),
    freeThresholdInr: z.number(),
    note: z.string(),
    /** Present only when express delivery is offered. */
    expressRateInr: z.number().nullable(),
  }),
  payments: z.object({
    invoice: z.boolean(),
    request: z.boolean(),
    razorpay: z.boolean(),
    /** Public Razorpay key id (empty when off) — checkout.js needs it. */
    razorpayKeyId: z.string(),
  }),
});
export type CommerceSettingsDto = z.infer<typeof CommerceSettingsDtoSchema>;

/** Builds the DTO from the cached settings + provider availability. */
export async function getCommerceSettings(): Promise<CommerceSettingsDto> {
  const settings = await settingsService.getSettings();
  let razorpay = false;
  try {
    getPaymentProvider('RAZORPAY', settings.features.razorpayCheckout);
    razorpay = true; // flag on (credentials are checked at authorize time)
  } catch {
    razorpay = false;
  }
  return {
    tax: { ratePercent: settings.tax.ratePercent },
    shipping: {
      flatRateInr: settings.shipping.flatRateInr,
      freeThresholdInr: settings.shipping.freeThresholdInr,
      note: settings.shipping.note,
      expressRateInr: settings.shipping.expressRateInr ?? null,
    },
    payments: { invoice: true, request: true, razorpay, razorpayKeyId: razorpay ? getEnv().RAZORPAY_KEY_ID : '' },
  };
}
