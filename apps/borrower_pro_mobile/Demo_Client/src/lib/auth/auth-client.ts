/**
 * Better Auth client for the mobile app.
 *
 * Uses the official @better-auth/expo integration which:
 * - Intercepts Set-Cookie headers and stores signed cookies in SecureStore
 * - Returns the stored cookie via getCookie() for attaching to API requests
 * - Provides useSession() hook backed by cached SecureStore data
 */

import { createAuthClient } from 'better-auth/react';
import { twoFactorClient } from 'better-auth/client/plugins';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';

import { shouldEnablePasskeyClientPlugin } from './passkey-config';

const backendUrl = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
type AuthClientOptions = NonNullable<Parameters<typeof createAuthClient>[0]>;
type AuthClientPlugin = NonNullable<AuthClientOptions['plugins']>[number];

function getPasskeyPlugin(): AuthClientPlugin | null {
  if (!shouldEnablePasskeyClientPlugin()) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { expoPasskeyClient } = require('expo-better-auth-passkey') as {
      expoPasskeyClient: () => AuthClientPlugin;
    };

    return expoPasskeyClient();
  } catch (error) {
    console.warn('[auth] Passkey plugin unavailable in this build:', error);
    return null;
  }
}

const passkeyPlugin = getPasskeyPlugin();

export const authClient = createAuthClient({
  baseURL: backendUrl,
  basePath: '/api/borrower-auth/auth',
  plugins: [
    expoClient({
      scheme: 'democlient',
      storagePrefix: 'truestack-borrower',
      // Match the server-side advanced.cookiePrefix so the plugin correctly
      // identifies and stores the borrower session cookie.
      cookiePrefix: 'truestack-borrower',
      storage: SecureStore,
    }),
    twoFactorClient(),
    ...(passkeyPlugin ? [passkeyPlugin] : []),
  ] as const,
});
