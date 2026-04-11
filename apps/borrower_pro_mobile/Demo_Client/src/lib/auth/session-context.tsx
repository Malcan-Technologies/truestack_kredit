/**
 * SessionContext — thin wrapper around Better Auth Expo's useSession hook.
 *
 * Provides a stable interface so the rest of the app doesn't import
 * directly from the auth client.
 */

import React, { createContext, useCallback, useContext } from 'react';
import { authClient } from './auth-client';
import type { AuthUser, GetSessionResult } from './auth-api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionState {
  session: GetSessionResult | null;
  user: AuthUser | null;
  /** True while the session is loading from SecureStore / server. */
  isLoading: boolean;
  /** Sign out: clears SecureStore token and session state. */
  signOut: () => Promise<void>;
  /** Refresh session from server. */
  refresh: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending, refetch } = authClient.useSession();

  const handleSignOut = useCallback(async () => {
    await authClient.signOut();
  }, []);

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return (
    <SessionContext.Provider
      value={{
        session: data as unknown as GetSessionResult | null,
        user: (data?.user ?? null) as AuthUser | null,
        isLoading: isPending,
        signOut: handleSignOut,
        refresh,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
