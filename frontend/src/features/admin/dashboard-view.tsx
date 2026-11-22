'use client';

// Dashboard (spec 15.1): KPI cards, latest orders, low-stock watchlist.
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, IndianRupee, Package, ShoppingCart } from 'lucide-react';
import { adminApi } from './admin-api';
import { AdminPageHeader } from './admin-shell';
import { Badge, Button, Skeleton } from '@/components/ui';
import { formatDateTime, formatInr } from '@/lib/format';

function Kpi({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Package }) {
  return (
    <div className="rounded-tile border border-line bg-white p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

export function DashboardView() {
  const query = useQuery({ queryKey: ['admin', 'stats'], queryFn: adminApi.stats, refetchInterval: 60_000 });

  if (query.isLoading) {
    return (
      <div>
        <AdminPageHeader title="Dashboard" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <AdminPageHeader title="Dashboard" />;
  }
  const stats = query.data;

  return (
    <div>
      <AdminPageHeader title="Dashboard">
        <Button href="/admin/products/new" variant="primary" size="sm">
          New product
        </Button>
      </AdminPageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Published products" value={`${stats.catalog.published} / ${stats.catalog.products}`} icon={Package} />
        <Kpi label="Variants" value={String(stats.catalog.variants)} icon={Package} />
        <Kpi label="Orders (30 days)" value={String(stats.orders.last30Days)} icon={ShoppingCart} />
        <Kpi label="Revenue (30 days)" value={formatInr(stats.orders.revenue30Days)} icon={IndianRupee} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Kpi label="Pending orders" value={String(stats.orders.pending)} icon={ShoppingCart} />
        <Kpi label="Failed imports" value={String(stats.orders.failedImports)} icon={AlertTriangle} />
        <Kpi label="Categories / Brands" value={`${stats.catalog.categories} / ${stats.catalog.brands}`} icon={Package} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="latest-orders">
          <div className="flex items-center justify-between">
            <h2 id="latest-orders" className="text-sm font-bold uppercase tracking-wide text-muted">Latest orders</h2>
            <Link href="/admin/orders" className="text-xs font-bold text-brand underline underline-offset-2">
              All orders
            </Link>
          </div>
          <ul className="mt-2 divide-y divide-line rounded-tile border border-line">
            {stats.latestOrders.map((order) => (
              <li key={order.orderNo} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <Link href={`/admin/orders/${order.orderNo}`} className="font-bold text-ink hover:text-brand">
                    {order.orderNo}
                  </Link>
                  <span className="block truncate text-xs text-muted">
                    {order.email} · {formatDateTime(order.createdAt)}
                  </span>
                </span>
                <Badge variant={order.status === 'CANCELLED' ? 'neutral' : 'brand'}>{order.status}</Badge>
                <span className="w-24 text-right font-bold">{formatInr(order.grandTotal)}</span>
              </li>
            ))}
            {stats.latestOrders.length === 0 ? <li className="px-4 py-6 text-sm text-muted">No orders yet.</li> : null}
          </ul>
        </section>

        <section aria-labelledby="low-stock">
          <div className="flex items-center justify-between">
            <h2 id="low-stock" className="text-sm font-bold uppercase tracking-wide text-muted">Low stock (&lt; 10)</h2>
          </div>
          <ul className="mt-2 divide-y divide-line rounded-tile border border-line">
            {stats.lowStock.map((variant) => (
              <li key={variant.variantId} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{variant.productName}</span>
                  <span className="block text-xs text-muted">
                    Article no.: {variant.articleNo}
                    {variant.leadTimeMinDays !== null ? ` · lead ${variant.leadTimeMinDays}–${variant.leadTimeMaxDays ?? variant.leadTimeMinDays} d` : ''}
                  </span>
                </span>
                <Badge variant={variant.stockQty === 0 ? 'neutral' : 'count'}>{variant.stockQty} left</Badge>
              </li>
            ))}
            {stats.lowStock.length === 0 ? <li className="px-4 py-6 text-sm text-muted">Nothing low on stock.</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
