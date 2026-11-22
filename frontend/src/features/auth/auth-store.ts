// In-memory access-token store (spec Section 10). The access JWT is NEVER
// persisted — the httpOnly `th_rt` refresh cookie is the browser's only
// persistence, and on page load the AuthProvider silently exchanges it for a
// fresh access token. Zustand keeps the token readable from both React
// (selector) and non-react contexts (`getAccessToken`).
import { create } from 'zustand';

interface AccessTokenState {
  accessToken: string | null;
  setAccessToken: (token: string) => void;
  clear: () => void;
}

export const useAccessTokenStore = create<AccessTokenState>()((set) => ({
  accessToken: null,
  setAccessToken: (token) => set({ accessToken: token }),
  clear: () => set({ accessToken: null }),
}));

/** Reads the current in-memory access token outside React (api wrappers). */
export function getAccessToken(): string | null {
  return useAccessTokenStore.getState().accessToken;
}
