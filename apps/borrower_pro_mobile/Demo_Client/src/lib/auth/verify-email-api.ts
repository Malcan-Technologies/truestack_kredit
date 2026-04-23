import { getEnv } from '@/lib/config/env';

/**
 * Confirms an email from a magic link token. Calls the same Better Auth mount as the native
 * client (`/api/borrower-auth/auth`), not the Next.js `/api/auth` proxy.
 */
export async function verifyEmailToken(token: string): Promise<void> {
  const base = getEnv().backendUrl;
  if (!base) {
    throw new Error('EXPO_PUBLIC_BACKEND_URL is not configured');
  }
  const url = `${base}/api/borrower-auth/auth/verify-email?${new URLSearchParams({ token })}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string;
      error?: { message?: string } | string;
    } | null;
    const errMsg =
      (typeof body?.message === 'string' && body.message) ||
      (typeof body?.error === 'object' && body.error?.message) ||
      (typeof body?.error === 'string' && body.error) ||
      'This verification link is invalid or has expired.';
    throw new Error(errMsg);
  }
}
