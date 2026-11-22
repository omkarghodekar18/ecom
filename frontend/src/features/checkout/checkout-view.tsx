'use client';

// Checkout view (spec 6.7): single-page stepper — shipping address (saved or
// new) → delivery method → payment → review (PO number, notes) → place order.
// Auth-gated client-side; guests land on login with ?redirect= back here and
// the guest cart merges automatically after sign-in.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, ChevronRight } from 'lucide-react';
import { Button, EmptyState, Input, RadioGroup, Skeleton, Textarea } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { routes } from '@/config/routes';
import { formatInr } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useAuth } from '@/features/auth/auth-provider';
import { authApi } from '@/features/auth/auth-api';
import { cartQueryKey } from '@/features/cart/cart-api';
import { useCart } from '@/features/cart/use-cart';
import { checkoutApi, type CommerceSettings } from './checkout-api';
import type { AddressDto } from '@/shared/dto/address.dto';
import type { DeliveryMethod, PaymentMethod } from '@/shared/dto/order.dto';

const STEPS = ['Shipping address', 'Delivery', 'Payment', 'Review & place order'] as const;

/** Razorpay checkout.js typings (loaded on demand; only reachable while the
 * feature flag is on and a gateway order exists). */
interface RazorpayInstance {
  open(): void;
  on(event: string, handler: (payload: unknown) => void): void;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

async function loadRazorpayScript(): Promise<boolean> {
  if (window.Razorpay) return true;
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function StepHeader({ index, title, active, done }: { index: number; title: string; active: boolean; done: boolean }) {
  return (
    <p
      className={cn(
        'flex items-center gap-2 border-b-2 pb-2 text-sm font-bold',
        active ? 'border-brand text-ink' : done ? 'border-stock-green text-ink' : 'border-transparent text-muted',
      )}
    >
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
          active ? 'bg-brand text-white' : done ? 'bg-stock-green text-white' : 'bg-tile text-muted',
        )}
        aria-hidden="true"
      >
        {done ? <Check className="h-3 w-3" /> : index + 1}
      </span>
      {title}
    </p>
  );
}

export function CheckoutView({ locale }: { locale: string }) {
  const { status } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const r = routes(locale);
  const { data: cart, isLoading: cartLoading } = useCart();

  const settingsQuery = useQuery({
    queryKey: ['checkout', 'settings'],
    queryFn: checkoutApi.getCommerceSettings,
    staleTime: 60_000,
  });
  const addressesQuery = useQuery({
    queryKey: ['account', 'addresses'],
    queryFn: authApi.listAddresses,
    enabled: status === 'authenticated',
  });

  // Saved addresses (derived straight from the query — no state mirroring).
  const addresses: AddressDto[] = useMemo(() => addressesQuery.data?.data ?? [], [addressesQuery.data]);

  // Form state.
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState({
    contactName: '',
    phone: '',
    line1: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'IN',
    gstin: '',
  });
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('standard');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('INVOICE');
  const [poNumber, setPoNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);

  // Auth gate: guests → login and back (cart merges on the way).
  useEffect(() => {
    if (status === 'guest') router.replace(r.login(r.checkout));
  }, [status, router, r]);

  // Default (derived): explicit pick > default shipping > first address.
  const effectiveAddressId =
    selectedAddressId ?? (addresses.find((a) => a.isDefaultShipping) ?? addresses[0])?.id ?? null;
  const selected = useMemo(
    () => addresses.find((a) => a.id === effectiveAddressId) ?? null,
    [addresses, effectiveAddressId],
  );

  if (status === 'loading' || cartLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState title="Your cart is empty" description="Add articles before checking out.">
        <Button href={r.home} variant="primary">
          Continue shopping
        </Button>
      </EmptyState>
    );
  }

  const settings: CommerceSettings | undefined = settingsQuery.data;
  const shippingEstimate =
    deliveryMethod === 'express' && settings?.shipping.expressRateInr != null
      ? String(settings.shipping.expressRateInr.toFixed(2))
      : cart.totals.shippingTotal;

  const validateAddress = (): string | null => {
    if (useNewAddress) {
      const required: Array<keyof typeof newAddress> = ['contactName', 'phone', 'line1', 'city', 'state', 'postalCode'];
      for (const field of required) {
        if (newAddress[field].trim() === '') return `Please fill in the ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}.`;
      }
      if (!/^[0-9]{6}$/.test(newAddress.postalCode.trim())) return 'Postal code must have 6 digits.';
      return null;
    }
    if (!selected) return 'Please select a shipping address.';
    return null;
  };

  const addressError = validateAddress();

  const buildAddressSnapshot = () => {
    if (useNewAddress) {
      return {
        contactName: newAddress.contactName.trim(),
        phone: newAddress.phone.trim(),
        line1: newAddress.line1.trim(),
        city: newAddress.city.trim(),
        state: newAddress.state.trim(),
        postalCode: newAddress.postalCode.trim(),
        country: 'IN',
        gstin: newAddress.gstin.trim() || undefined,
      };
    }
    const a = selected;
    if (!a) throw new Error('No address selected');
    return {
      contactName: a.contactName,
      phone: a.phone,
      line1: a.line1,
      line2: a.line2 ?? undefined,
      city: a.city,
      state: a.state,
      postalCode: a.postalCode,
      country: a.country,
      gstin: a.gstin ?? undefined,
    };
  };

  const finishRazorpay = async (orderNo: string, gatewayRef: string, keyId: string) => {
    const loaded = await loadRazorpayScript();
    if (!loaded) {
      toast({ title: 'Could not load the payment gateway', variant: 'error' });
      router.push(r.checkoutSuccess(orderNo));
      return;
    }
    const checkout = new window.Razorpay!({
      key: keyId,
      order_id: gatewayRef,
      name: 'ToolHub India',
      description: `Order ${orderNo}`,
      handler: async (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        try {
          await checkoutApi.verifyRazorpay({
            orderNo,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
        } finally {
          router.push(r.checkoutSuccess(orderNo));
        }
      },
    });
    checkout.on('payment.failed', () => {
      toast({ title: 'Payment failed — you can retry from the order page', variant: 'error' });
      router.push(r.checkoutSuccess(orderNo));
    });
    checkout.open();
  };

  const placeOrder = async () => {
    const addressErrorNow = validateAddress();
    if (addressErrorNow) {
      toast({ title: addressErrorNow, variant: 'error' });
      return;
    }
    setPlacing(true);
    try {
      const result = await checkoutApi.placeOrder({
        shippingAddress: buildAddressSnapshot(),
        deliveryMethod,
        paymentMethod,
        poNumber: poNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        idempotencyKey:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `key-${Date.now()}`,
      });
      void queryClient.invalidateQueries({ queryKey: cartQueryKey });
      if (paymentMethod === 'RAZORPAY' && result.payment.gatewayRef && settings?.payments.razorpayKeyId) {
        await finishRazorpay(result.orderNo, result.payment.gatewayRef, settings.payments.razorpayKeyId);
        return;
      }
      router.push(r.checkoutSuccess(result.orderNo));
    } catch (error) {
      toast({
        title: 'Could not place the order',
        description: error instanceof Error ? error.message : undefined,
        variant: 'error',
      });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="grid gap-10 pb-16 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
      <div className="space-y-10">
        {/* Step 1 — shipping address */}
        <section aria-labelledby="checkout-address">
          <StepHeader index={0} title={STEPS[0]} active done={selected !== null || useNewAddress} />
          <div className="mt-4 space-y-3">
            {addresses.length > 0 && !useNewAddress ? (
              <RadioGroup
                name="shipping-address"
                value={effectiveAddressId ?? undefined}
                onValueChange={setSelectedAddressId}
                options={addresses.map((a) => ({
                  value: a.id,
                  label: (
                    <span className="text-sm">
                      <span className="font-medium">{a.contactName}</span>
                      {a.label ? ` (${a.label})` : ''} — {a.line1}, {a.city}, {a.state} {a.postalCode}
                    </span>
                  ),
                }))}
              />
            ) : null}
            {useNewAddress ? (
              <div className="grid gap-3 rounded-tile border border-line p-4 sm:grid-cols-2">
                {(
                  [
                    ['contactName', 'Contact name'],
                    ['phone', 'Phone'],
                    ['line1', 'Street and number'],
                    ['city', 'City'],
                    ['state', 'State'],
                    ['postalCode', 'Postal code (6 digits)'],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="text-sm">
                    <span className="mb-1 block text-muted">{label}</span>
                    <Input
                      value={newAddress[field]}
                      onChange={(e) => setNewAddress((prev) => ({ ...prev, [field]: e.target.value }))}
                      autoComplete={field === 'postalCode' ? 'postal-code' : 'address-line1'}
                    />
                  </label>
                ))}
                <label className="text-sm">
                  <span className="mb-1 block text-muted">GSTIN (optional)</span>
                  <Input
                    value={newAddress.gstin}
                    onChange={(e) => setNewAddress((prev) => ({ ...prev, gstin: e.target.value.toUpperCase() }))}
                    placeholder="22AAAAA0000A1Z5"
                  />
                </label>
              </div>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setUseNewAddress((v) => !v)}>
              {useNewAddress ? 'Choose a saved address instead' : 'Deliver to a new address'}
            </Button>
          </div>
        </section>

        {/* Step 2 — delivery method */}
        <section aria-labelledby="checkout-delivery">
          <StepHeader index={1} title={STEPS[1]} active done={false} />
          <div className="mt-4">
            <RadioGroup
              name="delivery-method"
              value={deliveryMethod}
              onValueChange={(value) => setDeliveryMethod(value as DeliveryMethod)}
              options={[
                {
                  value: 'standard',
                  label: (
                    <span className="text-sm">
                      Standard delivery —{' '}
                      {cart.totals.shippingTotal === '0.00'
                        ? `Free from ${formatInr(String(settings?.shipping.freeThresholdInr ?? 0))}`
                        : formatInr(String(settings?.shipping.flatRateInr ?? 0))}
                    </span>
                  ),
                },
                ...(settings?.shipping.expressRateInr != null
                  ? [
                      {
                        value: 'express',
                        label: (
                          <span className="text-sm">
                            Express delivery — {formatInr(String(settings.shipping.expressRateInr))}
                          </span>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </section>

        {/* Step 3 — payment */}
        <section aria-labelledby="checkout-payment">
          <StepHeader index={2} title={STEPS[2]} active done={false} />
          <div className="mt-4">
            <RadioGroup
              name="payment-method"
              value={paymentMethod}
              onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
              options={[
                { value: 'INVOICE', label: <span className="text-sm">Pay on invoice (B2B standard terms)</span> },
                { value: 'REQUEST', label: <span className="text-sm">Request order — no charge yet</span> },
                ...(settings?.payments.razorpay
                  ? [{ value: 'RAZORPAY', label: <span className="text-sm">Online payment (Razorpay)</span> }]
                  : []),
              ]}
            />
          </div>
        </section>

        {/* Step 4 — review */}
        <section aria-labelledby="checkout-review">
          <StepHeader index={3} title={STEPS[3]} active done={false} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Your reference / PO number (optional)</span>
              <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} maxLength={40} />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-muted">Order notes (optional)</span>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Delivery instructions, commission notes…"
              />
            </label>
          </div>
          <ul className="mt-4 divide-y divide-line rounded-tile border border-line">
            {cart.items.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.productName}</span>
                  <span className="text-xs text-muted">
                    Article no.: {item.articleNo} · {item.quantity} × {formatInr(item.unitPrice)}
                  </span>
                </span>
                <span className="shrink-0 font-bold">{formatInr(item.lineTotal)}</span>
              </li>
            ))}
          </ul>
          {addressError ? (
            <p className="mt-4 flex items-center gap-2 rounded-tile border border-stock-red/50 bg-stock-red/10 p-3 text-sm text-ink">
              <AlertCircle className="h-4 w-4 shrink-0 text-stock-red" aria-hidden="true" />
              {addressError}
            </p>
          ) : null}
          <div className="mt-5">
            <Button variant="primary" size="lg" disabled={placing || addressError !== null} onClick={() => void placeOrder()}>
              {placing ? 'Placing order…' : `Place order — ${formatInr(cart.totals.grandTotal)}`}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </section>
      </div>

      {/* Summary rail */}
      <aside className="h-fit rounded-tile border border-line bg-tile p-6 lg:sticky lg:top-28">
        <h2 className="text-lg font-bold">Order summary</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal ({cart.itemCount} items)</dt>
            <dd>{formatInr(cart.totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">GST {cart.totals.taxRatePercent}%</dt>
            <dd>{formatInr(cart.totals.taxTotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Delivery ({deliveryMethod})</dt>
            <dd>{shippingEstimate === '0.00' ? 'Free' : formatInr(shippingEstimate)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
            <dt>Total</dt>
            <dd>{formatInr(cart.totals.grandTotal)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted">
          Totals are re-validated server-side when you place the order.
        </p>
      </aside>
    </div>
  );
}
