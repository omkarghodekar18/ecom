// PaymentProvider abstraction (spec 6.7): checkout records the method; the
// provider interface isolates the gateway. INVOICE and REQUEST are offline B2B
// terms (no gateway round-trip); RAZORPAY creates a gateway order via the REST
// API and is only selectable while the feature flag AND credentials are set.
import { createHmac } from 'node:crypto';
import { getEnv } from '../../config/env.js';
import { ERR } from '../../config/constants.js';
import { AppError } from '../../common/errors/app-error.js';
import type { PaymentMethod } from '../../shared/dto/order.dto.js';

export interface PaymentAuthorizeInput {
  orderNo: string;
  /** Grand total in the smallest currency unit (paise). */
  amountMinor: number;
  currency: string;
  email: string;
}

export interface PaymentAuthorization {
  gatewayRef: string | null;
}

export interface PaymentProvider {
  readonly method: PaymentMethod;
  /** Runs after the local order row committed; offline providers resolve instantly. */
  authorize(input: PaymentAuthorizeInput): Promise<PaymentAuthorization>;
}

const offline: PaymentAuthorization = { gatewayRef: null };

/** Pay on invoice (B2B default): payment due per invoice terms. */
export class InvoicePaymentProvider implements PaymentProvider {
  readonly method = 'INVOICE' as const;
  authorize(): Promise<PaymentAuthorization> {
    return Promise.resolve(offline);
  }
}

/** Request order: the order is a request; nothing is charged. */
export class RequestPaymentProvider implements PaymentProvider {
  readonly method = 'REQUEST' as const;
  authorize(): Promise<PaymentAuthorization> {
    return Promise.resolve(offline);
  }
}

/** Razorpay adapter: creates the gateway order the client pays against. */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly method = 'RAZORPAY' as const;

  authorize(input: PaymentAuthorizeInput): Promise<PaymentAuthorization> {
    return this.createGatewayOrder(input);
  }

  private async createGatewayOrder(input: PaymentAuthorizeInput): Promise<PaymentAuthorization> {
    const env = getEnv();
    if (env.RAZORPAY_KEY_ID === '' || env.RAZORPAY_KEY_SECRET === '') {
      throw new AppError(ERR.PAYMENT_FAILED, 'Razorpay is not configured', 503);
    }
    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: input.amountMinor,
        currency: input.currency,
        receipt: input.orderNo,
        notes: { orderNo: input.orderNo, email: input.email },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new AppError(ERR.PAYMENT_FAILED, `Razorpay order creation failed (${response.status})`, 502);
    }
    const payload = (await response.json()) as { id?: string };
    if (typeof payload.id !== 'string' || payload.id === '') {
      throw new AppError(ERR.PAYMENT_FAILED, 'Razorpay returned no order id', 502);
    }
    return { gatewayRef: payload.id };
  }
}

const providers: Record<PaymentMethod, PaymentProvider> = {
  INVOICE: new InvoicePaymentProvider(),
  REQUEST: new RequestPaymentProvider(),
  RAZORPAY: new RazorpayPaymentProvider(),
};

/**
 * The provider for a method. `razorpayCheckoutEnabled` gates RAZORPAY so the
 * method is only offered (and accepted) while the flag is on.
 */
export function getPaymentProvider(method: PaymentMethod, razorpayCheckoutEnabled: boolean): PaymentProvider {
  if (method === 'RAZORPAY' && !razorpayCheckoutEnabled) {
    throw new AppError(ERR.VALIDATION_ERROR, 'Online payment is not enabled for this shop', 400);
  }
  return providers[method];
}

/**
 * Verifies a Razorpay checkout signature:
 * HMAC-SHA256(`${gatewayOrderId}|${gatewayPaymentId}`, key secret) === signature.
 */
export function verifyRazorpaySignature(
  gatewayOrderId: string,
  gatewayPaymentId: string,
  signature: string,
): boolean {
  const secret = getEnv().RAZORPAY_KEY_SECRET;
  if (secret === '') return false;
  const expected = createHmac('sha256', secret)
    .update(`${gatewayOrderId}|${gatewayPaymentId}`)
    .digest('hex');
  return expected === signature;
}

/** Fetches a gateway order and returns its receipt (our orderNo). */
export async function fetchRazorpayReceipt(gatewayOrderId: string): Promise<string | null> {
  const env = getEnv();
  if (env.RAZORPAY_KEY_ID === '' || env.RAZORPAY_KEY_SECRET === '') return null;
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1/orders/${gatewayOrderId}`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { receipt?: string };
  return typeof payload.receipt === 'string' ? payload.receipt : null;
}
