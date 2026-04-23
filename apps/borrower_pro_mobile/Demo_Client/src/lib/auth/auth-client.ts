/**
 * Better Auth client for the mobile app.
 *
 * Uses the official @better-auth/expo integration which:
 * - Intercepts Set-Cookie headers and stores signed cookies in SecureStore
 * - Returns the stored cookie via getCookie() for attaching to API requests
 * - Provides useSession() hook backed by cached SecureStore data
 */

import { createAuthClient } from 'better-auth/react';
import { twoFactorClient, organizationClient } from 'better-auth/client/plugins';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';

const backendUrl = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');

export const authClient = createAuthClient({
  baseURL: backendUrl,
  basePath: '/api/borrower-auth/auth',
  plugins: [
    expoClient({
      scheme: 'democlient',
      storagePrefix: 'truestack-borrower',
      cookiePrefix: 'truestack-borrower',
      storage: SecureStore,
    }),
    twoFactorClient(),
    organizationClient({
      schema: {
        invitation: {
          additionalFields: {
            inviteKind: { type: 'string' },
          },
        },
      },
    }),
  ] as const,
});
