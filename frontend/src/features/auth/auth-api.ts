// API wrappers for the auth / users / addresses / companies modules
// (contract: docs/api.md, task 2-b). Public endpoints use plain `apiFetch`
// (cookies are attached by the browser); authenticated endpoints go through
// `authFetch`, which injects the bearer token and silently refreshes once on
// 401/TOKEN_EXPIRED.
import { ApiError, apiFetch } from '@/lib/api-client';
import type { AddressDto, AddressInput } from '@/shared/dto/address.dto';
import type { CompanyDto } from '@/shared/dto/company.dto';
import type {
  ForgotPasswordInput,
  LoginPasswordInput,
  MeDto,
  OtpRequestInput,
  OtpVerifyInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from '@/shared/dto/auth.dto';
import type { ChangePasswordInput, ProfileDto, SessionDto, UpdateProfileInput } from '@/shared/dto/users.dto';
import { csrfHeaders } from './cookies';
import { authFetch, type AuthSessionResponse } from './with-auth-fetch';

function idPath(base: string, id: string): string {
  return `${base}/${encodeURIComponent(id)}`;
}

/** Surfaces the backend error message, or a readable fallback for network errors. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback;
}

/** Extracts the cooldown (seconds) carried by OTP_COOLDOWN, if any. */
export function otpCooldownSeconds(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.code !== 'OTP_COOLDOWN') return null;
  const details = error.details as { retryAfterMin?: unknown } | undefined;
  const retryMin = details?.retryAfterMin;
  return typeof retryMin === 'number' && retryMin > 0 ? Math.ceil(retryMin * 60) : null;
}

export const authApi = {
  // ---------------------------------------------------------------- public --
  /** 202 {message} — generic response; UI always says "check your email". */
  register: (input: RegisterInput) =>
    apiFetch<{ message: string }>('/auth/register', { method: 'POST', body: input }),

  /** 200 {user, accessToken} — completes registration and signs in. */
  verifyEmail: (input: VerifyEmailInput) =>
    apiFetch<AuthSessionResponse>('/auth/verify-email', { method: 'POST', body: input }),

  /** 200 {user, accessToken} — also sets the th_rt/th_csrf cookies. */
  loginWithPassword: (input: LoginPasswordInput) =>
    apiFetch<AuthSessionResponse>('/auth/login/password', { method: 'POST', body: input }),

  /** 202 {message} — for unverified accounts this sends the REGISTER OTP. */
  requestLoginOtp: (input: OtpRequestInput) =>
    apiFetch<{ message: string }>('/auth/login/otp/request', { method: 'POST', body: input }),

  /** 200 {user, accessToken} — also sets the th_rt/th_csrf cookies. */
  verifyLoginOtp: (input: OtpVerifyInput) =>
    apiFetch<AuthSessionResponse>('/auth/login/otp/verify', { method: 'POST', body: input }),

  /** Rotates the refresh cookie; requires th_rt cookie + X-CSRF-Token header. */
  refresh: () =>
    apiFetch<AuthSessionResponse>('/auth/refresh', { method: 'POST', headers: csrfHeaders() }),

  /** 204 — clears cookies (needs th_rt + X-CSRF-Token header). */
  logout: () => apiFetch<void>('/auth/logout', { method: 'POST', headers: csrfHeaders() }),

  forgotPassword: (input: ForgotPasswordInput) =>
    apiFetch<{ message: string }>('/auth/password/forgot', { method: 'POST', body: input }),

  /** 204 on success. */
  resetPassword: (input: ResetPasswordInput) =>
    apiFetch<void>('/auth/password/reset', { method: 'POST', body: input }),

  // --------------------------------------------------- bearer-authenticated --
  me: () => authFetch<MeDto>('/auth/me'),

  updateProfile: (input: UpdateProfileInput) =>
    authFetch<ProfileDto>('/users/me', { method: 'PATCH', body: input }),

  /** 204 on success. */
  changePassword: (input: ChangePasswordInput) =>
    authFetch<void>('/users/me/password', { method: 'POST', body: input }),

  listSessions: () => authFetch<SessionDto[]>('/users/me/sessions'),

  /** 204 — revokes a single session. */
  revokeSession: (sessionId: string) =>
    authFetch<void>(idPath('/users/me/sessions', sessionId), { method: 'DELETE' }),

  /** 204 — revokes every session except the current one. */
  revokeOtherSessions: () => authFetch<void>('/users/me/sessions', { method: 'DELETE' }),

  listAddresses: () => authFetch<AddressDto[]>('/addresses'),

  createAddress: (input: AddressInput) =>
    authFetch<AddressDto>('/addresses', { method: 'POST', body: input }),

  updateAddress: (addressId: string, input: AddressInput) =>
    authFetch<AddressDto>(idPath('/addresses', addressId), { method: 'PATCH', body: input }),

  /** 204 on success. */
  deleteAddress: (addressId: string) =>
    authFetch<void>(idPath('/addresses', addressId), { method: 'DELETE' }),

  /** B2B only — 403/404 for B2C accounts. */
  getMyCompany: () => authFetch<CompanyDto>('/companies/me'),

  /** 204 — bearer-authenticated global sign-out of every session. */
  logoutAll: () => authFetch<void>('/auth/logout-all', { method: 'POST' }),
};
