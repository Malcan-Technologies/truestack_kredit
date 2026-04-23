/**
 * Expo inlines `EXPO_PUBLIC_*` at bundle time. Same backend API across clients; URLs differ per env.
 */
export function getEnv() {
  return {
    backendUrl: (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, ''),
    authBaseUrl: (process.env.EXPO_PUBLIC_AUTH_BASE_URL ?? '').replace(/\/$/, ''),
    clientId: process.env.EXPO_PUBLIC_CLIENT_ID ?? 'demo-client',
  };
}
