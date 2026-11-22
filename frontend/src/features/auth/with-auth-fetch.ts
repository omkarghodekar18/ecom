// Bearer-authenticated fetch helper with exactly ONE silent token refresh
// per 401 burst (promise dedupe) and a single retry after the refresh.
'use client';

import { ApiError, apiFetch, type ApiFetchOptions, type ApiResult } from '@/lib/api-client';
import type { MeDto } from '@/shared/dto/auth.dto';
import { getAccessToken, useAccessTokenStore } from './auth-store';
import { csrfHeaders } from './cookies';

/** Body returned by every token-issuing endpoint (login, refresh, verify). */
export interface AuthSessionResponse {
  user: MeDto;
  accessToken: string;
}

let refreshInFlight: Promise<AuthSessionResponse | null> | null = null;

async function performRefresh(): Promise<AuthSessionResponse | null> {
  try {
    const { data } = await apiFetch<AuthSessionResponse>('/auth/refresh', {
      method: 'POST',
      headers: csrfHeaders(),
    });
    useAccessTokenStore.getState().setAccessToken(data.accessToken);
    return data;
  } catch {
    // Missing/expired/replayed refresh cookie — force a clean guest state.
    useAccessTokenStore.getState().clear();
    return null;
  }
}

/**
 * Runs at most one `/auth/refresh` at a time: concurrent 401s share the same
 * in-flight promise so a burst of expired-token errors cannot trigger a
 * refresh storm (the backend rotates refresh tokens on every call).
 */
export function refreshAccessToken(): Promise<AuthSessionResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function isRetriableAuthError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.code === 'TOKEN_EXPIRED');
}

/**
 * `apiFetch` with the in-memory bearer token injected and a single retry
 * after a silent refresh when the call comes back `401` / `TOKEN_EXPIRED`.
 * All authenticated pages and hooks go through this wrapper.
 */
export async function authFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<ApiResult<T>> {
  const token = getAccessToken();
  const firstAttempt: ApiFetchOptions = token ? { ...opts, bearer: token } : opts;
  try {
    return await apiFetch<T>(path, firstAttempt);
  } catch (error) {
    if (!isRetriableAuthError(error)) throw error;
    const refreshed = await refreshAccessToken();
    if (!refreshed) throw error;
    return apiFetch<T>(path, { ...opts, bearer: refreshed.accessToken });
  }
}
