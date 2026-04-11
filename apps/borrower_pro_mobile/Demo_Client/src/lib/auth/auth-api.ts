/**
 * Auth API helpers — thin wrappers around the Better Auth Expo client.
 *
 * The authClient (from auth-client.ts) handles:
 * - Sending requests to backend_pro at /api/borrower-auth/auth
 * - Intercepting Set-Cookie responses and persisting signed cookies in SecureStore
 * - Providing getCookie() for attaching the session to API requests
 */

import { authClient } from './auth-client';
import { getEnv } from '@/lib/config/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  twoFactorEnabled?: boolean | null;
  image?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionRecord {
  id: string;
  token: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SignInResult {
  token: string;
  user: AuthUser;
}

export interface GetSessionResult {
  session: AuthSessionRecord;
  user: AuthUser;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sign in with email and password.
 * On success the expoClient stores the signed session cookie in SecureStore.
 * Returns `{ twoFactorRedirect: true }` when 2FA is required.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<SignInResult & { twoFactorRedirect?: boolean }> {
  const { data, error } = await authClient.signIn.email({
    email,
    password,
  });
  if (error) {
    throw new Error(error.message ?? 'Sign in failed');
  }
  // When 2FA is required, Better Auth returns twoFactorRedirect: true with no token
  if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
    return { twoFactorRedirect: true } as SignInResult & { twoFactorRedirect: true };
  }
  return data as unknown as SignInResult;
}

/**
 * Sign up with email, password, and display name.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  name: string,
): Promise<{ user: AuthUser; token?: string; emailVerificationRequired?: boolean }> {
  const { data, error } = await authClient.signUp.email({
    email,
    password,
    name,
  });
  if (error) {
    throw new Error(error.message ?? 'Sign up failed');
  }
  return data as unknown as { user: AuthUser; token?: string };
}

/**
 * Sign out. Clears local SecureStore token and notifies the server.
 */
export async function signOut(): Promise<void> {
  await authClient.signOut();
}

/**
 * Validate the stored session against the server.
 * Returns session+user data if valid, null otherwise.
 */
export async function getSession(): Promise<GetSessionResult | null> {
  const { data } = await authClient.getSession();
  if (!data?.session) return null;
  return data as unknown as GetSessionResult;
}

/**
 * Verify a TOTP code after sign-in when 2FA is required.
 */
export async function verifyTotp(
  code: string,
  trustDevice?: boolean,
): Promise<SignInResult> {
  const { data, error } = await (authClient as unknown as {
    twoFactor: {
      verifyTotp: (opts: { code: string; trustDevice: boolean }) => Promise<{ data: unknown; error: { message?: string } | null }>;
    };
  }).twoFactor.verifyTotp({ code, trustDevice: trustDevice ?? false });
  if (error) {
    throw new Error(error.message ?? 'TOTP verification failed');
  }
  return data as unknown as SignInResult;
}

/** Request a password reset email. */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await authClient.requestPasswordReset({
    email,
    redirectTo: `${getEnv().authBaseUrl}/reset-password`,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to request password reset');
  }
}

/** Resend verification email for a signed-up but unverified account. */
export async function sendVerificationEmail(email: string): Promise<void> {
  const { error } = await authClient.sendVerificationEmail({
    email,
    callbackURL: `${getEnv().authBaseUrl}/verify-email/confirm`,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to send verification email');
  }
}
