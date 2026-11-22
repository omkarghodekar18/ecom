'use client';

// Auth context: silent boot refresh, login/logout, status for guards.
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MeDto } from '@/shared/dto/auth.dto';
import { authApi } from './auth-api';
import { cartApi, cartQueryKey } from '@/features/cart/cart-api';
import { useAccessTokenStore } from './auth-store';
import { hasSessionCookie } from './cookies';
import { meQueryKey } from './query-keys';
import { refreshAccessToken } from './with-auth-fetch';

export type AuthStatus = 'loading' | 'authenticated' | 'guest';

export interface AuthContextValue {
  user: MeDto | null;
  status: AuthStatus;
  /** Stores the session after a successful login/verify and seeds ['auth','me']. */
  login: (user: MeDto, accessToken: string) => void;
  /** Cookie logout + global session revoke (errors ignored), then guest state. */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeDto | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const queryClient = useQueryClient();
  const router = useRouter();

  // Silent boot: if the browser holds a refresh cookie, exchange it for an
  // access token + user exactly once (shares the deduped refresh promise with
  // authFetch so concurrent boot calls never refresh twice).
  useEffect(() => {
    let cancelled = false;
    async function boot(): Promise<void> {
      if (!hasSessionCookie()) {
        setStatus('guest');
        return;
      }
      const session = await refreshAccessToken();
      if (cancelled) return;
      if (!session) {
        setStatus('guest');
        return;
      }
      queryClient.setQueryData(meQueryKey, session.user);
      setUser(session.user);
      setStatus('authenticated');
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  const login = useCallback(
    (nextUser: MeDto, accessToken: string) => {
      useAccessTokenStore.getState().setAccessToken(accessToken);
      queryClient.setQueryData(meQueryKey, nextUser);
      setUser(nextUser);
      setStatus('authenticated');
      // Spec 6.6: merge the guest cart into the user cart right after login.
      // Best-effort — failures never break the session (cartApi.merge catches).
      void cartApi.merge().then((cart) => {
        if (cart) queryClient.setQueryData(cartQueryKey, cart);
      });
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    // Best effort, in the contract order: cookie logout (csrf), then revoke
    // every other session with the still-valid bearer. Errors are ignored —
    // the local session is cleared regardless.
    try {
      await authApi.logout();
    } catch {
      // cookie already invalid — continue
    }
    try {
      await authApi.logoutAll();
    } catch {
      // access token already revoked — continue
    }
    useAccessTokenStore.getState().clear();
    queryClient.removeQueries({ queryKey: ['auth'] });
    queryClient.removeQueries({ queryKey: ['account'] });
    setUser(null);
    setStatus('guest');
    router.refresh();
  }, [queryClient, router]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, logout }),
    [user, status, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access the auth context; throws when used outside <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
