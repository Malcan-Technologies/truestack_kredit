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
import { sessionFetch } from './session-fetch';
import { revokeStoredBorrowerPushToken } from '@/lib/notifications/push-registration';
import {
  getPasskeyRpId,
  getPasskeySupportMessage,
} from './passkey-config';

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

export interface AccountProfile {
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt?: string;
  };
}

export interface RegisteredPasskey {
  id: string;
  name?: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  rpId?: string | null;
}

export interface PasswordInfoResult {
  passwordChangedAt: string | null;
}

export interface LoginHistoryEntry {
  id: string;
  ipAddress: string | null;
  deviceType: string | null;
  createdAt: string;
}

type BetterAuthResponse<T> = {
  data: T | null;
  error: {
    code?: string;
    message?: string;
  } | null;
};

const authClientUnsafe = authClient as unknown as {
  signIn: {
    email: (opts: {
      email: string;
      password: string;
    }) => Promise<BetterAuthResponse<unknown>>;
    passkey: (opts?: {
      email?: string;
      autoFill?: boolean;
    }) => Promise<BetterAuthResponse<unknown>>;
  };
  signUp: {
    email: (opts: {
      email: string;
      password: string;
      name: string;
    }) => Promise<BetterAuthResponse<unknown>>;
  };
  passkey: {
    addPasskey: (opts?: {
      name?: string;
      useAutoRegister?: boolean;
    }) => Promise<BetterAuthResponse<unknown>>;
  };
  changePassword: (opts: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<BetterAuthResponse<unknown>>;
  changeEmail: (opts: { newEmail: string }) => Promise<BetterAuthResponse<unknown>>;
  updateUser: (opts: { name: string }) => Promise<BetterAuthResponse<unknown>>;
  twoFactor: {
    enable: (opts: {
      password: string;
    }) => Promise<BetterAuthResponse<{ totpURI?: string; backupCodes?: string[] }>>;
    disable: (opts: {
      password: string;
    }) => Promise<BetterAuthResponse<unknown>>;
    verifyTotp: (opts: {
      code: string;
      trustDevice?: boolean;
    }) => Promise<BetterAuthResponse<unknown>>;
  };
};

function resolveErrorMessage(
  error: { message?: string } | null | undefined,
  fallback: string,
): string {
  return error?.message ?? fallback;
}

async function authJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await sessionFetch(`${getEnv().backendUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const json = (await response.json().catch(() => ({}))) as T & {
    success?: boolean;
    data?: unknown;
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(json.message || json.error || 'Request failed');
  }

  return json;
}

export { getPasskeySupportMessage, isPasskeyClientAvailable } from './passkey-config';

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
  const { data, error } = await authClientUnsafe.signIn.email({
    email,
    password,
  });
  if (error) {
    throw new Error(resolveErrorMessage(error, 'Sign in failed'));
  }
  // When 2FA is required, Better Auth returns twoFactorRedirect: true with no token
  if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
    return { twoFactorRedirect: true } as SignInResult & { twoFactorRedirect: true };
  }
  // Some Better Auth client/plugin combinations handle the 2FA redirect
  // internally and return no session payload here. Treat that as a pending
  // 2FA challenge instead of a completed login.
  if (!data) {
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
  const { data, error } = await authClientUnsafe.signUp.email({
    email,
    password,
    name,
  });
  if (error) {
    throw new Error(resolveErrorMessage(error, 'Sign up failed'));
  }
  return data as unknown as { user: AuthUser; token?: string };
}

export async function signInWithPasskey(email?: string): Promise<SignInResult> {
  const unavailableReason = getPasskeySupportMessage();
  if (unavailableReason) {
    throw new Error(unavailableReason);
  }

  const { data, error } = await authClientUnsafe.signIn.passkey({
    email: email?.trim() ? email.trim() : undefined,
    autoFill: true,
  });

  if (error) {
    throw new Error(resolveErrorMessage(error, 'Passkey sign in failed'));
  }

  return data as unknown as SignInResult;
}

export async function addDevicePasskey(name?: string): Promise<void> {
  const unavailableReason = getPasskeySupportMessage();
  if (unavailableReason) {
    throw new Error(unavailableReason);
  }

  const { error } = await authClientUnsafe.passkey.addPasskey({
    name: name?.trim() ? name.trim() : undefined,
    useAutoRegister: true,
  });

  if (error) {
    throw new Error(resolveErrorMessage(error, 'Unable to register passkey'));
  }
}

export async function deleteDevicePasskey(id: string): Promise<void> {
  await authJson<{ status: boolean }>(
    '/api/borrower-auth/auth/passkey/delete-passkey',
    {
      method: 'POST',
      body: JSON.stringify({ id }),
    },
  );
}

/**
 * Sign out. Clears local SecureStore token and notifies the server.
 */
export async function signOut(): Promise<void> {
  await revokeStoredBorrowerPushToken();
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
 * Two-factor management helpers for the signed-in account screen.
 */
export async function enableTwoFactor(
  password: string,
): Promise<{ totpURI?: string; backupCodes?: string[] }> {
  const { data, error } = await authClientUnsafe.twoFactor.enable({
    password,
  });

  if (error) {
    throw new Error(resolveErrorMessage(error, 'Unable to start two-factor setup'));
  }

  return data ?? {};
}

export async function getTotpUri(password: string): Promise<string> {
  const json = await authJson<{ totpURI?: string }>(
    '/api/borrower-auth/auth/two-factor/get-totp-uri',
    {
      method: 'POST',
      body: JSON.stringify({ password }),
    },
  );

  if (!json.totpURI) {
    throw new Error('Missing authenticator setup details');
  }

  return json.totpURI;
}

export async function verifyTotp(
  code: string,
  trustDevice?: boolean,
): Promise<SignInResult> {
  const { data, error } = await authClientUnsafe.twoFactor.verifyTotp({
    code,
    trustDevice: trustDevice ?? false,
  });

  if (error) {
    throw new Error(resolveErrorMessage(error, 'Two-factor verification failed'));
  }

  return data as SignInResult;
}

export async function disableTwoFactor(password: string): Promise<void> {
  const { error } = await authClientUnsafe.twoFactor.disable({
    password,
  });

  if (error) {
    throw new Error(resolveErrorMessage(error, 'Unable to disable two-factor authentication'));
  }
}

/** Request a password reset email. */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await authClient.requestPasswordReset({
    email,
    redirectTo: `${getEnv().authBaseUrl}/reset-password`,
  });
  if (error) {
    throw new Error(resolveErrorMessage(error, 'Failed to request password reset'));
  }
}

/** Resend verification email for a signed-up but unverified account. */
export async function sendVerificationEmail(email: string): Promise<void> {
  const { error } = await authClient.sendVerificationEmail({
    email,
    callbackURL: `${getEnv().authBaseUrl}/verify-email/confirm`,
  });
  if (error) {
    throw new Error(resolveErrorMessage(error, 'Failed to send verification email'));
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const { error } = await authClientUnsafe.changePassword({
    currentPassword,
    newPassword,
  });

  if (error) {
    throw new Error(resolveErrorMessage(error, 'Failed to change password'));
  }
}

export async function changeEmail(newEmail: string): Promise<void> {
  const { error } = await authClientUnsafe.changeEmail({
    newEmail,
  });

  if (error) {
    throw new Error(resolveErrorMessage(error, 'Failed to change email'));
  }
}

export async function updateUserProfile(name: string): Promise<void> {
  const { error } = await authClientUnsafe.updateUser({ name });

  if (error) {
    throw new Error(resolveErrorMessage(error, 'Failed to update profile'));
  }
}

export async function fetchAccountProfile(): Promise<AccountProfile> {
  const json = await authJson<{ success: true; data: AccountProfile }>(
    '/api/borrower-auth/account',
  );

  return json.data;
}

export async function fetchPasswordInfo(): Promise<PasswordInfoResult> {
  const json = await authJson<{ success: true; data: PasswordInfoResult }>(
    '/api/auth/password-info',
  );

  return json.data;
}

export async function fetchLoginHistory(): Promise<LoginHistoryEntry[]> {
  const json = await authJson<{ success: true; data: LoginHistoryEntry[] }>(
    '/api/auth/login-history',
  );

  return Array.isArray(json.data) ? json.data : [];
}

export async function listUserPasskeys(): Promise<RegisteredPasskey[]> {
  const rpId = getPasskeyRpId() || new URL(getEnv().authBaseUrl || getEnv().backendUrl).hostname;
  const json = await authJson<{ success: true; data: RegisteredPasskey[] }>(
    `/api/auth/passkeys?rpId=${encodeURIComponent(rpId)}`,
  );

  return Array.isArray(json.data) ? json.data : [];
}
