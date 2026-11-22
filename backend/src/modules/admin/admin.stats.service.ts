// Admin stats service (spec Section 15.1): dashboard KPIs, latest orders and
// the low-stock watchlist. Read-only aggregations kept in one place.
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { Transaction } from '../../db/transaction-types.js';

export interface AdminStatsDto {
  catalog: { products: number; published: number; variants: number; categories: number; brands: number };
  orders: { last30Days: number; revenue30Days: string; pending: number; failedImports: number };
  latestOrders: Array<{
    orderNo: string;
    email: string;
    status: string;
    paymentStatus: string;
    grandTotal: string;
    createdAt: string;
  }>;
  lowStock: Array<{
    variantId: string;
    articleNo: string;
    productName: string;
    stockQty: number;
    leadTimeMinDays: number | null;
    leadTimeMaxDays: number | null;
  }>;
}

/** Dashboard aggregations. Revenue = grand totals of non-cancelled orders. */
export async function getAdminStats(tx?: Transaction): Promise<AdminStatsDto> {
  const db = tx ?? prisma;
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [products, published, variants, categories, brands, orders30, revenue30, pending, failedImports, latestOrders, lowStock] =
    await Promise.all([
      db.product.count({ where: { deletedAt: null } }),
      db.product.count({ where: { deletedAt: null, status: 'PUBLISHED' } }),
      db.variant.count({ where: { deletedAt: null } }),
      db.category.count({ where: { deletedAt: null } }),
      db.brand.count(),
      db.order.count({ where: { createdAt: { gte: since30 } } }),
      db.order.aggregate({
        where: { createdAt: { gte: since30 }, status: { not: 'CANCELLED' } },
        _sum: { grandTotal: true },
      }),
      db.order.count({ where: { status: 'PENDING' } }),
      db.importJob.count({ where: { status: 'FAILED' } }),
      db.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          orderNo: true,
          status: true,
          paymentStatus: true,
          grandTotal: true,
          createdAt: true,
          user: { select: { email: true } },
        },
      }),
      db.variant.findMany({
        where: { deletedAt: null, isActive: true, stockQty: { lt: 10 }, product: { deletedAt: null, status: 'PUBLISHED' } },
        orderBy: { stockQty: 'asc' },
        take: 10,
        select: {
          id: true,
          articleNo: true,
          stockQty: true,
          leadTimeMinDays: true,
          leadTimeMaxDays: true,
          product: { select: { name: true } },
        },
      }),
    ]);

  return {
    catalog: { products, published, variants, categories, brands },
    orders: {
      last30Days: orders30,
      revenue30Days: (revenue30._sum.grandTotal ?? new Prisma.Decimal(0)).toFixed(2),
      pending,
      failedImports,
    },
    latestOrders: latestOrders.map((order) => ({
      orderNo: order.orderNo,
      email: order.user.email,
      status: order.status,
      paymentStatus: order.paymentStatus,
      grandTotal: order.grandTotal.toFixed(2),
      createdAt: order.createdAt.toISOString(),
    })),
    lowStock: lowStock.map((variant) => ({
      variantId: variant.id,
      articleNo: variant.articleNo,
      productName: variant.product.name,
      stockQty: variant.stockQty,
      leadTimeMinDays: variant.leadTimeMinDays,
      leadTimeMaxDays: variant.leadTimeMaxDays,
    })),
  };
}
