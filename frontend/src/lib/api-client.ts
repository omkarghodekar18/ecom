// Typed HTTP client for the backend REST API. Used by server components
// (absolute internal URL) and client hooks (same-origin /api/v1 rewrite).
import { publicEnv } from '@/config/env';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Server-side: forward the raw Cookie header of an incoming request. */
  cookie?: string;
  /** Server-side: bearer access token. */
  bearer?: string;
  query?: Record<string, string | number | boolean | string[] | undefined>;
}

function baseUrl(): string {
  if (typeof window === 'undefined') {
    // Server: bypass the rewrite and hit the API directly.
    const internal = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:4000';
    return `${internal}/api/v1`;
  }
  return publicEnv.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
}

function buildUrl(path: string, query?: ApiFetchOptions['query']): string {
  const url = `${baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((item) => params.append(k, item));
    else params.append(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export interface ApiResult<T> {
  data: T;
  meta?: PageMeta;
}

/** Envelope shape returned by every backend endpoint. */
interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  meta?: PageMeta;
  error?: ApiErrorShape;
}

export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<ApiResult<T>> {
  const { body, cookie, bearer, query, headers, ...rest } = opts;
  const url = buildUrl(path, query);
  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...((headers as Record<string, string>) ?? {}),
  };
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  if (cookie) finalHeaders.Cookie = cookie;
  if (bearer) finalHeaders.Authorization = `Bearer ${bearer}`;

  const res = await fetch(url, {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
    // Default to no-store ONLY when the caller did not opt into caching
    // (ISR pages pass next.revalidate/tags, which cache:'no-store' would veto).
    ...(rest.cache === undefined && !rest.next ? { cache: 'no-store' as RequestCache } : {}),
  });

  // 204 No Content: success without an envelope (logout, deletes, password
  // changes). Await the call and ignore `data` — there is no body to parse.
  if (res.status === 204) {
    return { data: undefined as T };
  }

  let json: ApiEnvelope<T> | null = null;
  try {
    json = (await res.json()) as ApiEnvelope<T> | null;
  } catch {
    // Non-JSON response (gateway error page etc.)
  }

  if (!res.ok || !json?.success) {
    const err = json?.error;
    throw new ApiError(res.status, err?.code ?? 'NETWORK_ERROR', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return { data: json.data as T, meta: json.meta };
}

/** Server components: read cookies via next/headers and forward them. */
export async function apiFetchWithCookies<T>(path: string, opts: ApiFetchOptions = {}): Promise<ApiResult<T>> {
  const { cookies } = await import('next/headers');
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  return apiFetch<T>(path, { ...opts, cookie: cookieHeader });
}
