'use client';

// Data hooks for the auth feature. User data lives in the ['auth','me'] query,
// seeded by the AuthProvider from the silent refresh result.
import { useQuery } from '@tanstack/react-query';
import type { AddressDto } from '@/shared/dto/address.dto';
import type { CompanyDto } from '@/shared/dto/company.dto';
import type { MeDto } from '@/shared/dto/auth.dto';
import type { SessionDto } from '@/shared/dto/users.dto';
import { authApi } from './auth-api';
import { useAuth } from './auth-provider';
import { addressesQueryKey, companyQueryKey, meQueryKey, sessionsQueryKey } from './query-keys';

/** Current user; seeded from the boot refresh, refetched while authenticated. */
export function useMe() {
  const { status } = useAuth();
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async () => (await authApi.me()).data,
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });
}

export function useAddresses() {
  const { status } = useAuth();
  return useQuery({
    queryKey: addressesQueryKey,
    queryFn: async () => (await authApi.listAddresses()).data,
    enabled: status === 'authenticated',
  });
}

export function useSessions() {
  const { status } = useAuth();
  return useQuery({
    queryKey: sessionsQueryKey,
    queryFn: async () => (await authApi.listSessions()).data,
    enabled: status === 'authenticated',
  });
}

export function useMyCompany(enabled: boolean) {
  return useQuery({
    queryKey: companyQueryKey,
    queryFn: async () => (await authApi.getMyCompany()).data,
    enabled,
  });
}

export type { MeDto, SessionDto, AddressDto, CompanyDto };
