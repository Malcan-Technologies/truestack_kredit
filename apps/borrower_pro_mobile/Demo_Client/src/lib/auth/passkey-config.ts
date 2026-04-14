import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getEnv } from '@/lib/config/env';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function parseHostname(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string | null | undefined) {
  if (!hostname) {
    return false;
  }

  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

export function getPasskeyRpId() {
  const env = getEnv();
  const configuredRpId = env.passkeyRpId?.trim();

  if (configuredRpId) {
    return configuredRpId;
  }

  return parseHostname(env.authBaseUrl);
}

export function isExpoGoRuntime() {
  if (Platform.OS === 'web') {
    return false;
  }

  return Constants.appOwnership === 'expo';
}

export function shouldEnablePasskeyClientPlugin() {
  return Platform.OS === 'web' || !isExpoGoRuntime();
}

export function hasNativePasskeyDomainConfig() {
  const rpId = getPasskeyRpId();
  return Boolean(rpId && !isLoopbackHost(rpId));
}

export function getPasskeySupportMessage() {
  if (isExpoGoRuntime()) {
    return 'Passkeys require a native development build or production build. Expo Go does not include the passkey module.';
  }

  if (Platform.OS !== 'web' && !hasNativePasskeyDomainConfig()) {
    return 'Native passkeys need an HTTPS relying-party domain. Set EXPO_PUBLIC_PASSKEY_RP_ID or point EXPO_PUBLIC_AUTH_BASE_URL to a tunneled/deployed HTTPS host. Plain localhost only works for the web flow.';
  }

  return null;
}

export function isPasskeyClientAvailable() {
  return getPasskeySupportMessage() === null;
}
