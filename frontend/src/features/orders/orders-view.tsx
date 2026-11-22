'use client';

// Order history + detail (spec 6.9): list with status, detail with the status
// timeline, line snapshots, reorder button and the invoice download
// placeholder. Client-rendered like the rest of the account area.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Repeat2 } from 'lucide-react';
import { Badge, Button, EmptyState, Skeleton } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { authFetch } from '@/features/auth/with-auth-fetch';
import { routes } from '@/config/routes';
import { formatDate, formatInr } from '@/lib/format';
import { cartQueryKey } from '@/features/cart/cart-api';
import type { OrderDetailDto, OrderListItemDto } from '@/shared/dto/order.dto';
import type { PageMeta } from '@/lib/api-client';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const ordersApi = {
  async list(page = 1): Promise<{ items: OrderListItemDto[]; meta: PageMeta }> {
    const res = await authFetch<OrderListItemDto[]>('/orders', { query: { page, pageSize: 10 } });
    return { items: res.data, meta: res.meta as PageMeta };
  },
  async detail(orderNo: string): Promise<OrderDetailDto> {
    const { data } = await authFetch<OrderDetailDto>(`/orders/${encodeURIComponent(orderNo)}`);
    return data;
  },
  async reorder(orderNo: string) {
    const { data } = await authFetch<unknown>(`/orders/${encodeURIComponent(orderNo)}/reorder`, { method: 'POST' });
    return data;
  },
};

export function OrdersView({ locale }: { locale: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['orders', page],
    queryFn: () => ordersApi.list(page),
  });
  const r = routes(locale);

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return <EmptyState title="Could not load your orders" description={(query.error as Error).message} />;
  }
  const data = query.data;
  if (!data) return null;
  const { items, meta } = data;
  if (items.length === 0) {
    return (
      <EmptyState
        title="No orders yet"
        description="Your placed orders will appear here with their status timeline."
      >
        <Button href={r.home} variant="primary">
          Browse the catalogue
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="pb-10">
      <ul className="divide-y divide-line rounded-tile border border-line">
        {items.map((order) => (
          <li key={order.orderNo} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:flex-nowrap">
            <span className="min-w-0 flex-1">
              <Link href={r.orderDetail(order.orderNo)} className="font-bold text-ink hover:text-brand-hover">
                {order.orderNo}
              </Link>
              <span className="block text-xs text-muted">
                {formatDate(order.createdAt)} · {order.itemCount} items · {order.paymentMethod}
              </span>
            </span>
            <Badge variant={order.status === 'CANCELLED' ? 'neutral' : 'brand'}>
              {STATUS_LABEL[order.status] ?? order.status}
            </Badge>
            <span className="w-28 text-right font-bold">{formatInr(order.grandTotal)}</span>
            <Button href={r.orderDetail(order.orderNo)} variant="outline" size="sm">
              View
            </Button>
          </li>
        ))}
      </ul>
      {meta.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-muted">
            Page {meta.page} of {meta.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function OrderDetailView({ locale, orderNo }: { locale: string; orderNo: string }) {
  const query = useQuery({
    queryKey: ['orders', 'detail', orderNo],
    queryFn: () => ordersApi.detail(orderNo),
  });
  const queryClient = useQueryClient();
  const router = useRouter();
  const reorder = useMutation({
    mutationFn: () => ordersApi.reorder(orderNo),
    onSuccess: (cart) => {
      queryClient.setQueryData(cartQueryKey, cart);
      void queryClient.invalidateQueries({ queryKey: cartQueryKey });
      toast({ title: 'All lines added back to the cart', variant: 'success' });
      router.push(routes(locale).cart);
    },
    onError: (error: Error) => toast({ title: 'Could not reorder', description: error.message, variant: 'error' }),
  });

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (query.isError || !query.data) {
    return <EmptyState title="Order not found" description="It may belong to another account." />;
  }
  const order: OrderDetailDto = query.data;

  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">{order.orderNo}</h1>
          <p className="mt-1 text-sm text-muted">
            {formatDate(order.createdAt)} · {STATUS_LABEL[order.status] ?? order.status} · Payment:{' '}
            {order.paymentStatus}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={reorder.isPending} onClick={() => reorder.mutate()}>
            <Repeat2 className="h-4 w-4" aria-hidden="true" />
            Reorder
          </Button>
          <Button variant="outline" size="sm" disabled title="Available once the invoice is issued">
            <FileText className="h-4 w-4" aria-hidden="true" />
            Invoice
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Items</h2>
          <ul className="mt-2 divide-y divide-line rounded-tile border border-line">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="text-xs text-muted">
                    Article no.: {item.articleNo} · {item.quantity} × {formatInr(item.unitPrice)}
                  </span>
                </span>
                <span className="shrink-0 font-bold">{formatInr(item.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-muted">Status timeline</h2>
          <ol className="mt-2 space-y-3 border-l-2 border-line pl-4">
            {order.events.map((event) => (
              <li key={event.id} className="relative">
                <span
                  className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium">{STATUS_LABEL[event.status] ?? event.status}</p>
                <p className="text-xs text-muted">
                  {formatDate(event.createdAt)}
                  {event.note ? ` — ${event.note}` : ''}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <aside className="h-fit rounded-tile border border-line bg-tile p-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Summary</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd>{formatInr(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">GST</dt>
              <dd>{formatInr(order.taxTotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Delivery</dt>
              <dd>{formatInr(order.shippingTotal)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 font-bold">
              <dt>Total</dt>
              <dd>{formatInr(order.grandTotal)}</dd>
            </div>
          </dl>
          <h3 className="mt-5 text-sm font-bold">Shipping address</h3>
          <p className="mt-1 text-sm text-muted">
            {order.shippingAddress.contactName}
            <br />
            {order.shippingAddress.line1}
            {order.shippingAddress.line2 ? <><br />{order.shippingAddress.line2}</> : null}
            <br />
            {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}
            <br />
            {order.shippingAddress.country}
          </p>
          {order.poNumber ? <p className="mt-3 text-xs text-muted">Your reference: {order.poNumber}</p> : null}
        </aside>
      </div>
    </div>
  );
}
