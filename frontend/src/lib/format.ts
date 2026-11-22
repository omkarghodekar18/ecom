// Display formatters: INR prices, dates, availability — shared by storefront
// and admin. Prices are transported as strings to avoid float issues.

export function formatInr(amount: string | number | null | undefined): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `INR ${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}`;
}

// Dates are formatted in IST (Asia/Kolkata) so server-rendered HTML and the
// client hydration pass agree regardless of the server's local timezone —
// ISO strings with Z otherwise shift by a day for late-evening UTC times.
export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);
}

export function formatDateTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(d);
}

export interface AvailabilityInput {
  stockQty: number;
  leadTimeMinDays?: number | null;
  leadTimeMaxDays?: number | null;
}

export type AvailabilityTone = 'green' | 'amber' | 'red';

export function availabilityInfo(v: AvailabilityInput): { tone: AvailabilityTone; label: string } {
  if (v.stockQty > 0) return { tone: 'green', label: 'In stock' };
  if (v.leadTimeMinDays != null && v.leadTimeMaxDays != null && v.leadTimeMinDays > 0) {
    return { tone: 'amber', label: `Available in ${v.leadTimeMinDays}–${v.leadTimeMaxDays} working days` };
  }
  return { tone: 'red', label: 'Not available' };
}

/** "Article no.: 111100 0,5" — bold label rendered separately in components. */
export function articleNoLabel(articleNo: string): string {
  return `Article no.: ${articleNo}`;
}

export function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
