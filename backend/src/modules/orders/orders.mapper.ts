// Order DTO mapping: rows → list/detail DTOs (snapshots are read-only JSON).
import type { OrderStatus, PaymentStatus } from '@prisma/client';
import type { OrderDetailDto, OrderEventDto, OrderItemDto, OrderListItemDto } from '../../shared/dto/order.dto.js';
import type { AddressSnapshot } from '../../shared/dto/order.dto.js';
import type { VariantAttributes } from '../../shared/dto/product.dto.js';
import { mediaUrl } from '../catalog/public-id.util.js';
import type { OrderDetailRow, OrderListRow } from './orders.repository.js';

export function toOrderListItemDto(row: OrderListRow): OrderListItemDto {
  return {
    orderNo: row.orderNo,
    status: row.status as OrderStatus,
    paymentStatus: row.paymentStatus as PaymentStatus,
    paymentMethod: row.paymentMethod,
    grandTotal: row.grandTotal.toFixed(2),
    currency: row.currency,
    itemCount: row.items.reduce((sum, item) => sum + item.quantity, 0),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toOrderDetailDto(row: OrderDetailRow): OrderDetailDto {
  const items: OrderItemDto[] = row.items.map((item) => ({
    id: item.id,
    variantId: item.variantId,
    articleNo: item.articleNo,
    name: item.name,
    attributesSnapshot: (item.attributesSnapshot ?? null) as VariantAttributes | null,
    image: item.imagePublicId === null ? null : mediaUrl(item.imagePublicId),
    unitPrice: item.unitPrice.toFixed(2),
    quantity: item.quantity,
    lineTotal: item.lineTotal.toFixed(2),
  }));
  const events: OrderEventDto[] = row.events.map((event) => ({
    id: event.id,
    status: event.status as OrderStatus,
    note: event.note,
    createdAt: event.createdAt.toISOString(),
  }));
  return {
    orderNo: row.orderNo,
    status: row.status as OrderStatus,
    paymentStatus: row.paymentStatus as PaymentStatus,
    paymentMethod: row.paymentMethod,
    grandTotal: row.grandTotal.toFixed(2),
    currency: row.currency,
    itemCount: items.length,
    createdAt: row.createdAt.toISOString(),
    shippingAddress: row.shippingAddress as unknown as AddressSnapshot,
    billingAddress: row.billingAddress as unknown as AddressSnapshot,
    poNumber: row.poNumber,
    notes: row.notes,
    subtotal: row.subtotal.toFixed(2),
    taxTotal: row.taxTotal.toFixed(2),
    shippingTotal: row.shippingTotal.toFixed(2),
    items,
    events,
  };
}
