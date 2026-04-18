/**
 * sessionFetch: a FetchFn that attaches the stored session cookie to every request.
 *
 * Uses authClient.getCookie() from the Better Auth Expo client, which returns
 * the correctly-signed cookie string that Better Auth's server-side can verify.
 *
 * If no cookie is present (expired or never stored — e.g. iOS networking consumed
 * the Set-Cookie header on sign-in), returns a synthetic 401 immediately rather
 * than firing an unauthenticated request. Callers that check res.ok will throw,
 * which the (app)/_layout.tsx auth-error handler catches to trigger sign-out.
 */

import type { FetchFn } from '@kredit/borrower';
import { authClient } from './auth-client';

const authClientWithCookie = authClient as typeof authClient & {
  getCookie: () => string | null | undefined;
};

export const sessionFetch: FetchFn = async (url, init) => {
  const cookie = authClientWithCookie.getCookie?.();
  if (!cookie) {
    return new Response(
      JSON.stringify({ error: 'No active session. Please sign in again.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  headers.set('Cookie', cookie);
  return fetch(url, { ...init, headers });
};
