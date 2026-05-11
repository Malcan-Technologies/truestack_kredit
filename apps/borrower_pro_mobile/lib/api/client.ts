import { getEnv } from '@/lib/config/env';

export type ApiFetchInit = RequestInit & { path: string };

/**
 * Thin wrapper for `backend_pro` (or BFF). Auth transport (cookies vs headers) comes later.
 */
export async function apiFetch({ path, headers, ...init }: ApiFetchInit): Promise<Response> {
  const { backendUrl } = getEnv();
  if (!backendUrl) {
    throw new Error('EXPO_PUBLIC_BACKEND_URL is not set');
  }
  const url = `${backendUrl}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...headers,
    },
  });
}
