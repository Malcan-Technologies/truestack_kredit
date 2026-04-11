/**
 * sessionFetch: a FetchFn that attaches the stored session cookie to every request.
 *
 * Uses authClient.getCookie() from the Better Auth Expo client, which returns
 * the correctly-signed cookie string that Better Auth's server-side can verify.
 */

import type { FetchFn } from '@kredit/borrower';
import { authClient } from './auth-client';

export const sessionFetch: FetchFn = async (url, init) => {
  const cookie = authClient.getCookie();
  if (!cookie) {
    return fetch(url, init);
  }
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  headers.set('Cookie', cookie);
  return fetch(url, { ...init, headers });
};
