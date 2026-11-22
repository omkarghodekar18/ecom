'use client';

// "Prices plus delivery costs" info (spec 6.3): the underlined link in the
// price block opens a small modal with static shipping information.
import { useState } from 'react';
import { Modal, PriceBlock } from '@/components/ui';
import { site } from '@/config/site';
import { formatInr } from '@/lib/format';
import { cn } from '@/lib/cn';

export interface ShippingInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Static shipping & delivery-cost info modal. */
export function ShippingInfoModal({ open, onOpenChange }: ShippingInfoModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Shipping and delivery costs"
      description="How delivery costs are calculated"
    >
      <div className="space-y-3 text-sm leading-6 text-ink">
        <p>
          All product prices on {site.name} exclude VAT/GST and exclude delivery costs. The exact
          delivery cost for your order is calculated in the checkout and depends on the total
          weight, the dimensions of the goods and the delivery address within India.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Standard ground shipping within India: charged at cost, shown before you order.</li>
          <li>
            Free standard shipping for orders of {formatInr('5000')} or more (net, excluding tax).
          </li>
          <li>Express and priority delivery options are selectable in the checkout.</li>
          <li>
            Heavy goods (e.g. machine stands, workshop equipment) are shipped by freight carrier;
            surcharges may apply.
          </li>
        </ul>
        <p className="text-muted">
          You will always see the complete delivery costs for your order before you place it. Your
          contact for delivery questions: {site.name} customer service.
        </p>
      </div>
    </Modal>
  );
}

/** Price block (from-price + VAT note + delivery-cost link) with its modal. */
export function PriceWithShippingInfo({
  priceFrom,
  alignEnd = false,
}: {
  priceFrom: string | null;
  alignEnd?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PriceBlock
        prefix="from"
        amount={formatInr(priceFrom)}
        vatNote={site.copy.vatNote}
        deliveryInfo={{ label: site.copy.deliveryNote, onClick: () => setOpen(true) }}
        className={cn(alignEnd && 'items-end')}
      />
      <ShippingInfoModal open={open} onOpenChange={setOpen} />
    </>
  );
}
