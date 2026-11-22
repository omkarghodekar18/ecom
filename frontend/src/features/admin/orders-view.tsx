'use client';

// Orders admin (spec 15.6): filtered list with CSV export + detail with the
// validated status transitions, notes edit and confirmation-email resend.
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Mail, Save } from 'lucide-react';
import { Badge, Button, Input, Select, Skeleton } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { getAccessToken } from '@/features/auth/auth-store';
import { adminApi, type AdminOrderListItem } from './admin-api';
import { AdminPageHeader } from './admin-shell';
import { formatDateTime, formatInr } from '@/lib/format';
import type { OrderDetailDto } from '@/shared/dto/order.dto';

const NEXT_STATUSES: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function AdminOrdersView() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['admin', 'orders', { q, status, page }],
    queryFn: () => adminApi.listOrders({ q: q || undefined, status: status || undefined, page, pageSize: 20 }),
  });

  const exportCsv = async () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    const token = getAccessToken();
    const response = await fetch(`/api/v1/admin/orders/export?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!response.ok) {
      toast({ title: 'Export failed', variant: 'error' });
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'orders.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const meta = query.data?.meta;

  return (
    <div>
      <AdminPageHeader title="Orders">
        <Button variant="outline" size="sm" onClick={() => void exportCsv()}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </Button>
      </AdminPageHeader>

      <form className="mb-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); }}>
        <Input
          value={q}
          onChange={(event) => { setQ(event.target.value); setPage(1); }}
          placeholder="Order no., PO number or email"
          aria-label="Search orders"
          className="min-w-56 flex-1"
        />
        <Select
          value={status}
          onValueChange={(value) => { setStatus(value); setPage(1); }}
          options={[{ value: '', label: 'All statuses' }, ...Object.keys(NEXT_STATUSES).map((value) => ({ value, label: value }))]}
          className="w-44"
        />
      </form>

      {query.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-12" />)}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-tile border border-line">
          <table className="w-full text-sm">
            <thead className="bg-tile text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-bold">Order</th>
                <th className="px-4 py-2.5 font-bold">Customer</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 font-bold">Payment</th>
                <th className="px-4 py-2.5 font-bold">Items</th>
                <th className="px-4 py-2.5 font-bold">Total</th>
                <th className="px-4 py-2.5 font-bold">Placed</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(query.data?.data ?? []).map((order: AdminOrderListItem) => (
                <tr key={order.orderNo} className="hover:bg-tile/60">
                  <td className="px-4 py-2.5 font-medium">{order.orderNo}{order.poNumber ? <span className="block text-xs text-muted">PO {order.poNumber}</span> : null}</td>
                  <td className="px-4 py-2.5">
                    {order.customerName}
                    <span className="block text-xs text-muted">{order.email}</span>
                  </td>
                  <td className="px-4 py-2.5"><Badge variant={order.status === 'CANCELLED' ? 'neutral' : 'brand'}>{order.status}</Badge></td>
                  <td className="px-4 py-2.5 text-xs">{order.paymentStatus} · {order.paymentMethod}</td>
                  <td className="px-4 py-2.5">{order.itemCount}</td>
                  <td className="px-4 py-2.5 font-bold">{formatInr(order.grandTotal)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted">{formatDateTime(order.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/admin/orders/${order.orderNo}`} className="text-xs font-bold text-brand underline underline-offset-2">View</Link>
                  </td>
                </tr>
              ))}
              {(query.data?.data ?? []).length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">No orders match.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-muted">Page {meta.page} of {meta.totalPages} · {meta.total} orders</span>
          <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      ) : null}
    </div>
  );
}

export function AdminOrderDetail({ orderNo }: { orderNo: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['admin', 'orders', 'detail', orderNo],
    queryFn: () => adminApi.orderDetail(orderNo),
  });
  const [notes, setNotes] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: (body: { status?: string; notes?: string | null }) => adminApi.updateOrder(orderNo, body),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'orders', 'detail', orderNo], data);
      toast({ title: 'Order updated', variant: 'success' });
    },
    onError: (error: Error) => toast({ title: 'Update failed', description: error.message, variant: 'error' }),
  });
  const resend = useMutation({
    mutationFn: () => adminApi.resendOrderEmail(orderNo),
    onSuccess: () => toast({ title: 'Confirmation email queued', variant: 'success' }),
    onError: (error: Error) => toast({ title: 'Resend failed', description: error.message, variant: 'error' }),
  });

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (query.isError || !query.data) return <AdminPageHeader title="Order not found" />;
  const { order, customer } = query.data;
  const effectiveNotes = notes ?? order.notes ?? '';

  return (
    <div>
      <AdminPageHeader title={order.orderNo}>
        <Button variant="outline" size="sm" disabled={resend.isPending} onClick={() => resend.mutate()}>
          <Mail className="h-4 w-4" aria-hidden="true" />
          Resend email
        </Button>
        {(NEXT_STATUSES[order.status] ?? []).length > 0 ? (
          <Select
            value=""
            placeholder="Set status…"
            onValueChange={(value) => update.mutate({ status: value })}
            options={(NEXT_STATUSES[order.status] ?? []).map((value) => ({ value, label: `→ ${value}` }))}
            className="w-40"
          />
        ) : null}
      </AdminPageHeader>

      <p className="text-sm text-muted">
        {customer.name} · {customer.email} · placed {formatDateTime(order.createdAt)} · payment {order.paymentStatus} ({order.paymentMethod})
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Items</h2>
          <ul className="mt-2 divide-y divide-line rounded-tile border border-line text-sm">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="text-xs text-muted">Article no.: {item.articleNo} · {item.quantity} × {formatInr(item.unitPrice)}</span>
                </span>
                <span className="shrink-0 font-bold">{formatInr(item.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-muted">Timeline</h2>
          <ol className="mt-2 space-y-3 border-l-2 border-line pl-4">
            {order.events.map((event) => (
              <li key={event.id} className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand" aria-hidden="true" />
                <p className="text-sm font-medium">{event.status}</p>
                <p className="text-xs text-muted">{formatDateTime(event.createdAt)}{event.note ? ` — ${event.note}` : ''}</p>
              </li>
            ))}
          </ol>
        </div>

        <aside className="h-fit space-y-4">
          <div className="rounded-tile border border-line bg-tile p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatInr(order.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">GST</dt><dd>{formatInr(order.taxTotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd>{formatInr(order.shippingTotal)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 font-bold"><dt>Total</dt><dd>{formatInr(order.grandTotal)}</dd></div>
            </dl>
            <h3 className="mt-4 text-sm font-bold">Shipping address</h3>
            <p className="mt-1 text-sm text-muted">
              {order.shippingAddress.contactName}<br />
              {order.shippingAddress.line1}{order.shippingAddress.line2 ? <><br />{order.shippingAddress.line2}</> : null}<br />
              {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}<br />
              {order.shippingAddress.country}{order.shippingAddress.gstin ? <> · GSTIN {order.shippingAddress.gstin}</> : null}
            </p>
          </div>

          <div className="rounded-tile border border-line p-5">
            <label className="text-sm">
              <span className="mb-1 block font-bold">Order notes</span>
              <textarea
                rows={4}
                className="w-full rounded-btn border border-line bg-white px-3 py-2 text-sm"
                value={effectiveNotes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            <Button variant="primary" size="sm" className="mt-3" disabled={update.isPending} onClick={() => update.mutate({ notes: effectiveNotes })}>
              <Save className="h-4 w-4" aria-hidden="true" />
              Save notes
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
