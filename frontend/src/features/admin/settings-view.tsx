'use client';

// Settings admin (spec 15.9): tax rate, shipping rules (incl. optional
// express), stock policy and the Razorpay feature flag. Email templates can
// be previewed through the dev outbox note.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { Button, Input, Select, Textarea } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { adminApi, type AppSettings } from './admin-api';
import { AdminPageHeader } from './admin-shell';

type Draft = {
  taxRate: string;
  flatRate: string;
  freeThreshold: string;
  expressRate: string;
  shippingNote: string;
  stockPolicy: string;
  razorpay: boolean;
};

function SettingsForm({ initial }: { initial: AppSettings }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>({
    taxRate: String(initial.tax.ratePercent),
    flatRate: String(initial.shipping.flatRateInr),
    freeThreshold: String(initial.shipping.freeThresholdInr),
    expressRate: initial.shipping.expressRateInr !== undefined ? String(initial.shipping.expressRateInr) : '',
    shippingNote: initial.shipping.note,
    stockPolicy: initial.stock.policy,
    razorpay: initial.features.razorpayCheckout,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const body: Partial<AppSettings> = {
        tax: { ratePercent: Number(draft.taxRate) },
        shipping: {
          flatRateInr: Number(draft.flatRate),
          freeThresholdInr: Number(draft.freeThreshold),
          note: draft.shippingNote,
          ...(draft.expressRate !== '' ? { expressRateInr: Number(draft.expressRate) } : {}),
        },
        stock: { policy: draft.stockPolicy === 'STOCK_ONLY' ? 'STOCK_ONLY' : 'ALLOW_BACKORDER' },
        features: { razorpayCheckout: draft.razorpay },
      };
      await adminApi.updateSettings(body);
      toast({ title: 'Settings saved', variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    } catch (error) {
      toast({ title: 'Could not save', description: error instanceof Error ? error.message : undefined, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <AdminPageHeader title="Settings">
        <Button variant="primary" size="sm" disabled={saving} onClick={() => void save()}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
      </AdminPageHeader>

      <div className="grid max-w-3xl gap-8">
        <section aria-labelledby="tax-heading">
          <h2 id="tax-heading" className="text-sm font-bold uppercase tracking-wide text-muted">Tax</h2>
          <label className="mt-2 block max-w-56 text-sm">
            <span className="mb-1 block text-muted">GST rate (%)</span>
            <Input type="number" value={draft.taxRate} onChange={(event) => setDraft((prev) => prev && { ...prev, taxRate: event.target.value })} />
          </label>
          <p className="mt-1 text-xs text-muted">Prices display excluding tax with “plus VAT/GST at the current rate”.</p>
        </section>

        <section aria-labelledby="shipping-heading">
          <h2 id="shipping-heading" className="text-sm font-bold uppercase tracking-wide text-muted">Shipping</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Flat rate (INR)</span>
              <Input type="number" value={draft.flatRate} onChange={(event) => setDraft((prev) => prev && { ...prev, flatRate: event.target.value })} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Free threshold (INR)</span>
              <Input type="number" value={draft.freeThreshold} onChange={(event) => setDraft((prev) => prev && { ...prev, freeThreshold: event.target.value })} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Express rate (empty = off)</span>
              <Input type="number" value={draft.expressRate} onChange={(event) => setDraft((prev) => prev && { ...prev, expressRate: event.target.value })} />
            </label>
            <label className="text-sm sm:col-span-3">
              <span className="mb-1 block text-muted">Cart note</span>
              <Textarea rows={2} value={draft.shippingNote} onChange={(event) => setDraft((prev) => prev && { ...prev, shippingNote: event.target.value })} />
            </label>
          </div>
        </section>

        <section aria-labelledby="stock-heading">
          <h2 id="stock-heading" className="text-sm font-bold uppercase tracking-wide text-muted">Stock policy</h2>
          <div className="mt-2 max-w-72">
            <Select
              value={draft.stockPolicy}
              onValueChange={(value) => setDraft((prev) => prev && { ...prev, stockPolicy: value })}
              options={[
                { value: 'ALLOW_BACKORDER', label: 'Allow backorder' },
                { value: 'STOCK_ONLY', label: 'Sell stock only' },
              ]}
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            STOCK_ONLY rejects lines beyond the shelf at add-to-cart and checkout; ALLOW_BACKORDER accepts them and
            decrements stock below zero (open backorder).
          </p>
        </section>

        <section aria-labelledby="features-heading">
          <h2 id="features-heading" className="text-sm font-bold uppercase tracking-wide text-muted">Feature flags</h2>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--brand-orange)]"
              checked={draft.razorpay}
              onChange={(event) => setDraft((prev) => prev && { ...prev, razorpay: event.target.checked })}
            />
            Online payment (Razorpay) in checkout — also requires RAZORPAY_KEY_ID/SECRET on the API
          </label>
        </section>

        <section aria-labelledby="mail-heading">
          <h2 id="mail-heading" className="text-sm font-bold uppercase tracking-wide text-muted">Email templates</h2>
          <p className="mt-1 text-xs text-muted">
            Templates render server-side (OTP, welcome, password reset, order confirmation). With
            MAIL_PROVIDER=file every sent email lands in <code>backend/var/outbox/</code> for preview.
          </p>
        </section>
      </div>
    </div>
  );
}

export function SettingsView() {
  const query = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminApi.getSettings });
  if (query.isLoading) return <AdminPageHeader title="Settings" />;
  if (query.isError || !query.data) {
    return (
      <div>
        <AdminPageHeader title="Settings" />
        <p className="text-sm text-stock-red">{(query.error as Error).message ?? 'Could not load settings.'}</p>
      </div>
    );
  }
  // Remount the form whenever fresh settings load (initial state from props).
  return <SettingsForm key={JSON.stringify(query.data)} initial={query.data} />;
}
