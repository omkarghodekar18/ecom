// Order confirmation email (spec Section 11): sent via the
// 'order.confirmation' background job right after place-order commits.
import type { MailContent } from '../mail.types.js';
import { escapeHtml, renderLayout, renderTextFooter } from './layout.js';

export interface OrderConfirmationItem {
  name: string;
  articleNo: string;
  quantity: number;
  lineTotal: string;
}

export interface OrderConfirmationContext {
  orderNo: string;
  customerName: string;
  items: OrderConfirmationItem[];
  subtotal: string;
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;
  deliveryMethod: string;
  paymentMethod: string;
  poNumber?: string | null;
}

/** Renders the order confirmation (HTML + text). Money values are pre-formatted strings. */
export function orderConfirmationTemplate(order: OrderConfirmationContext): MailContent {
  const subject = `Order confirmation ${order.orderNo}`;
  const intro = `Thank you for your order, ${order.customerName}. We confirm receipt of your order ${order.orderNo}.`;

  const rows = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #EEE;color:#1F2937;font-size:14px;">
          ${escapeHtml(item.name)}<br />
          <span style="color:#6B7280;font-size:12px;">Article no.: ${escapeHtml(item.articleNo)}</span>
        </td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid #EEE;color:#1F2937;font-size:14px;white-space:nowrap;">
          ${item.quantity} \u00d7 INR ${escapeHtml(item.lineTotal)}
        </td>
      </tr>`,
    )
    .join('');

  const totalRow = (label: string, value: string, strong = false) => `
      <tr>
        <td style="padding:6px 0;color:${strong ? '#1F2937' : '#6B7280'};font-size:${strong ? '15px' : '13px'};${strong ? 'font-weight:bold;' : ''}">${label}</td>
        <td align="right" style="padding:6px 0;color:#1F2937;font-size:${strong ? '15px' : '13px'};${strong ? 'font-weight:bold;' : ''}white-space:nowrap;">INR ${escapeHtml(value)}</td>
      </tr>`;

  const bodyHtml = `
    <p style="margin:0 0 20px 0;">${escapeHtml(intro)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
      ${rows}
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
      ${totalRow('Subtotal (excl. GST)', order.subtotal)}
      ${totalRow('GST', order.taxTotal)}
      ${totalRow('Delivery', order.shippingTotal)}
      ${totalRow('Total', order.grandTotal, true)}
    </table>
    <p style="margin:0 0 8px 0;font-size:13px;color:#6B7280;">
      Delivery: ${escapeHtml(order.deliveryMethod)} \u00b7 Payment: ${escapeHtml(order.paymentMethod)}${
        order.poNumber ? ` \u00b7 Your reference: ${escapeHtml(order.poNumber)}` : ''
      }
    </p>
    <p style="margin:0;color:#6B7280;font-size:13px;">You can follow the status of your order in your ToolHub account.</p>`;

  const text = [
    'Hello,',
    '',
    intro,
    '',
    ...order.items.map((item) => `  ${item.name} (art. ${item.articleNo}) x${item.quantity} = INR ${item.lineTotal}`),
    '',
    `  Subtotal (excl. GST): INR ${order.subtotal}`,
    `  GST: INR ${order.taxTotal}`,
    `  Delivery: INR ${order.shippingTotal}`,
    `  Total: INR ${order.grandTotal}`,
    '',
    `Delivery: ${order.deliveryMethod} / Payment: ${order.paymentMethod}`,
    '',
    renderTextFooter(),
  ].join('\n');

  return { subject, html: renderLayout({ preheader: `Order ${order.orderNo} confirmed — total INR ${order.grandTotal}`, bodyHtml }), text };
}
