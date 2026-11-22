'use client';

// Admin API client (spec Section 15) — every back-office endpoint behind the
// bearer-authenticated fetch. Types mirror the backend DTOs loosely (the API
// is the contract); list responses carry { data, meta }.
import { authFetch } from '@/features/auth/with-auth-fetch';
import type { ApiResult, PageMeta } from '@/lib/api-client';
import type { ProductDetailDto } from '@/shared/dto/product.dto';
import type { OrderDetailDto } from '@/shared/dto/order.dto';

export interface AdminStats {
  catalog: { products: number; published: number; variants: number; categories: number; brands: number };
  orders: { last30Days: number; revenue30Days: string; pending: number; failedImports: number };
  latestOrders: Array<{ orderNo: string; email: string; status: string; paymentStatus: string; grandTotal: string; createdAt: string }>;
  lowStock: Array<{ variantId: string; articleNo: string; productName: string; stockQty: number; leadTimeMinDays: number | null; leadTimeMaxDays: number | null }>;
}

export interface AdminOrderListItem {
  orderNo: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  grandTotal: string;
  itemCount: number;
  poNumber: string | null;
  email: string;
  customerName: string;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  type: 'B2B' | 'B2C';
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  companyId: string | null;
  companyName: string | null;
}

export interface AdminCompany {
  id: string;
  name: string;
  gstin: string | null;
  customerNumber: string | null;
  users: number;
  customerPrices: number;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  diff: unknown;
  ip: string | null;
  createdAt: string;
}

export interface AppSettings {
  tax: { ratePercent: number };
  shipping: { flatRateInr: number; freeThresholdInr: number; note: string; expressRateInr?: number };
  stock: { policy: 'STOCK_ONLY' | 'ALLOW_BACKORDER' };
  features: { razorpayCheckout: boolean };
}

export interface AdminProductListItem {
  id: string;
  name: string;
  slug: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  brandName: string;
  categoryName: string;
  variantCount: number;
  minPrice: string | null;
  imageCount: number;
  createdAt: string;
  updatedAt: string;
}

type Query = Record<string, string | number | boolean | undefined>;

async function get<T>(path: string, query?: Query): Promise<ApiResult<T>> {
  return authFetch<T>(path, { query });
}

// Tiny verb helpers to keep the big object below readable.
async function adminPost<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  return authFetch<T>(path, { method: 'POST', body });
}
async function adminPatch<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  return authFetch<T>(path, { method: 'PATCH', body });
}
async function adminDelete<T>(path: string): Promise<ApiResult<T>> {
  return authFetch<T>(path, { method: 'DELETE' });
}

export const adminApi = {
  // ── dashboard ────────────────────────────────────────────────────────────
  stats: async (): Promise<AdminStats> => (await get<AdminStats>('/admin/stats')).data,

  // ── orders ───────────────────────────────────────────────────────────────
  listOrders: async (query: Query): Promise<ApiResult<AdminOrderListItem[]>> =>
    get<AdminOrderListItem[]>('/admin/orders', query),
  orderDetail: async (orderNo: string): Promise<{ order: OrderDetailDto; customer: { email: string; name: string } }> =>
    (await get<{ order: OrderDetailDto; customer: { email: string; name: string } }>(`/admin/orders/${encodeURIComponent(orderNo)}`)).data,
  updateOrder: async (orderNo: string, body: { status?: string; notes?: string | null }) =>
    (await adminPatch<{ order: OrderDetailDto; customer: { email: string; name: string } }>(`/admin/orders/${encodeURIComponent(orderNo)}`, body)).data,
  resendOrderEmail: (orderNo: string) =>
    adminPost<{ queued: boolean }>(`/admin/orders/${encodeURIComponent(orderNo)}/resend-email`, {}),
  ordersExportUrl: (query: Query): string => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    return `/api/v1/admin/orders/export?${params.toString()}`;
  },

  // ── users / companies ────────────────────────────────────────────────────
  listUsers: async (query: Query): Promise<ApiResult<AdminUser[]>> => get<AdminUser[]>('/admin/users', query),
  updateUser: (id: string, body: { isActive?: boolean; role?: AdminUser['role'] }) =>
    adminPatch<{ id: string }>(`/admin/users/${id}`, body),
  listCompanies: async (): Promise<AdminCompany[]> => (await get<AdminCompany[]>('/admin/companies')).data,
  updateCompany: (id: string, body: { name?: string; gstin?: string; customerNumber?: string }) =>
    adminPatch<{ id: string }>(`/admin/companies/${id}`, body),

  // ── audit ────────────────────────────────────────────────────────────────
  listAudit: async (query: Query): Promise<ApiResult<AuditEntry[]>> => get<AuditEntry[]>('/admin/audit-logs', query),

  // ── settings ─────────────────────────────────────────────────────────────
  getSettings: async (): Promise<AppSettings> => (await get<AppSettings>('/admin/settings')).data,
  updateSettings: (body: Partial<AppSettings>) => adminPatch<AppSettings>('/admin/settings', body),

  // ── products (spec 15.2) ─────────────────────────────────────────────────
  listProducts: async (query: Query): Promise<ApiResult<AdminProductListItem[]>> =>
    get<AdminProductListItem[]>('/admin/products', query),
  productDetail: async (slug: string): Promise<ProductDetailDto> =>
    (await get<ProductDetailDto>(`/products/${encodeURIComponent(slug)}`)).data,
  createProduct: (body: Record<string, unknown>) => adminPost<{ id: string; slug: string }>('/admin/products', body),
  updateProduct: (id: string, body: Record<string, unknown>) =>
    adminPatch<{ id: string; slug: string }>(`/admin/products/${id}`, body),
  deleteProduct: (id: string) => adminDelete<void>(`/admin/products/${id}`),
  bulkUpdateProducts: (body: { ids: string[]; action: 'PUBLISH' | 'UNPUBLISH' | 'ARCHIVE' | 'RESTORE' | 'DELETE' | 'MOVE'; categoryId?: string }) =>
    adminPost<{ updated: number }>('/admin/products/bulk', body),
  duplicateProduct: (id: string) => adminPost<{ id: string; slug: string; name: string }>(`/admin/products/${id}/duplicate`, {}),
  createVariant: (productId: string, body: Record<string, unknown>) =>
    adminPost<unknown>(`/admin/products/${productId}/variants`, body),
  updateVariant: (productId: string, variantId: string, body: Record<string, unknown>) =>
    adminPatch<unknown>(`/admin/products/${productId}/variants/${variantId}`, body),
  deleteVariant: (productId: string, variantId: string) =>
    adminDelete<void>(`/admin/products/${productId}/variants/${variantId}`),
  replacePriceTiers: (productId: string, variantId: string, body: unknown) =>
    authFetch<unknown>(`/admin/products/${productId}/price-tiers/${variantId}`, { method: 'PUT', body }),
  replaceImages: (productId: string, body: unknown) =>
    authFetch<unknown>(`/admin/products/${productId}/images`, { method: 'PUT', body }),
  replaceDocuments: (productId: string, body: unknown) =>
    authFetch<unknown>(`/admin/products/${productId}/documents`, { method: 'PUT', body }),

  // ── categories (spec 15.3) ───────────────────────────────────────────────
  createCategory: (body: Record<string, unknown>) => adminPost<{ id: string }>('/admin/categories', body),
  updateCategory: (id: string, body: Record<string, unknown>) =>
    adminPatch<{ id: string }>(`/admin/categories/${id}`, body),
  moveCategory: (body: { id: string; newParentId: string | null; sortOrder?: number }) =>
    adminPost<void>('/admin/categories/move', body),
  reorderCategories: (body: Array<{ id: string; parentId?: string | null; sortOrder: number }>) =>
    adminPost<void>('/admin/categories/reorder', body),
  deleteCategory: (id: string) => adminDelete<void>(`/admin/categories/${id}`),
  putCategoryAttributes: (id: string, body: unknown) =>
    authFetch<void>(`/admin/categories/${id}/attributes`, { method: 'PUT', body }),

  // ── brands / attributes (spec 15.4) ──────────────────────────────────────
  createBrand: (body: Record<string, unknown>) => adminPost<{ id: string }>('/admin/brands', body),
  updateBrand: (id: string, body: Record<string, unknown>) => adminPatch<{ id: string }>(`/admin/brands/${id}`, body),
  deleteBrand: (id: string) => adminDelete<void>(`/admin/brands/${id}`),
  createAttribute: (body: Record<string, unknown>) => adminPost<{ id: string }>('/admin/attributes', body),
  updateAttribute: (id: string, body: Record<string, unknown>) =>
    adminPatch<{ id: string }>(`/admin/attributes/${id}`, body),
  deleteAttribute: (id: string) => adminDelete<void>(`/admin/attributes/${id}`),

  // ── content (spec 15.5) ──────────────────────────────────────────────────
  createBanner: (body: Record<string, unknown>) => adminPost<unknown>('/admin/banners', body),
  updateBanner: (id: string, body: Record<string, unknown>) => adminPatch<unknown>(`/admin/banners/${id}`, body),
  deleteBanner: (id: string) => adminDelete<void>(`/admin/banners/${id}`),
  upsertCmsPage: (body: Record<string, unknown>) => adminPost<unknown>('/admin/cms/pages', body),
  updateCmsPage: (slug: string, body: Record<string, unknown>) =>
    adminPatch<unknown>(`/admin/cms/pages/${slug}`, body),

  // ── import center (spec 16) ──────────────────────────────────────────────
  listImports: async (query: Query): Promise<ApiResult<ImportJobListItem[]>> =>
    get<ImportJobListItem[]>('/admin/imports', query),
  importDetail: async (id: string, query?: Query): Promise<ApiResult<ImportJobDetail>> =>
    get<ImportJobDetail>(`/admin/imports/${encodeURIComponent(id)}`, query),
  uploadImport: (body: { fileName: string; contentBase64: string; mode: 'XLSX' | 'CSV'; options?: ImportOptionsDto }) =>
    adminPost<{ jobId: string }>('/admin/imports', body),
  commitImport: (id: string) => adminPost<{ queued: boolean }>(`/admin/imports/${id}/commit`, {}),
  rollbackImport: (id: string) => adminPost<{ restored: number }>(`/admin/imports/${id}/rollback`, {}),
  cancelImport: (id: string) => adminPost<{ cancelled: boolean }>(`/admin/imports/${id}/cancel`, {}),
};

export interface ImportOptionsDto {
  onDuplicateArticleNo: 'UPDATE' | 'SKIP' | 'FAIL';
  createMissingBrands: boolean;
  publishStatus: 'DRAFT' | 'PUBLISHED';
  strictImages: boolean;
}

export interface ImportJobListItem {
  id: string;
  status: string;
  fileName: string;
  mode: string;
  createdAt: string;
  finishedAt: string | null;
  stats: { errors?: number; warnings?: number; create?: number; update?: number; skip?: number } | null;
  createdByEmail: string | null;
  _count: { issues: number };
}

export interface ImportJobDetail {
  job: ImportJobListItem & { options?: ImportOptionsDto };
  issues: Array<{
    id: string;
    sheet: string;
    rowNumber: number;
    column: string | null;
    severity: 'ERROR' | 'WARNING';
    code: string;
    message: string;
    rawValue: string | null;
  }>;
};
