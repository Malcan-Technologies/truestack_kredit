export const DEFAULT_AUTH_BASE_PATH = "/api/auth";

export const AUTH_COOKIE_PREFIXES = {
  default: "better-auth",
  admin: "truestack-admin",
  borrower: "truestack-borrower",
} as const;

export const AUTH_LINK_TOKEN_MAX_AGE_SECONDS = 15 * 60;
export const TRUSTED_DEVICE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const TWO_FACTOR_COOKIE_MAX_AGE_SECONDS = 10 * 60;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return trimTrailingSlash(value.trim());
}

export function splitOrigins(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];

  const seen = new Set<string>();
  for (const item of value.split(",")) {
    const normalized = normalizeOrigin(item);
    if (normalized) seen.add(normalized);
  }

  return Array.from(seen);
}

export function collectOrigins(
  ...groups: Array<string | string[] | null | undefined>
): string[] {
  const seen = new Set<string>();

  for (const group of groups) {
    if (!group) continue;

    const values = Array.isArray(group) ? group : [group];
    for (const value of values) {
      const normalized = normalizeOrigin(value);
      if (normalized) seen.add(normalized);
    }
  }

  return Array.from(seen);
}

export function resolveAuthBaseUrl(
  explicitBaseUrl: string | null | undefined,
  fallbackBaseUrl: string
): string {
  return normalizeOrigin(explicitBaseUrl) ?? trimTrailingSlash(fallbackBaseUrl);
}

export function buildAbsoluteUrl(baseUrl: string, path: string): string {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

export function getPasskeyRpId(baseUrl: string): string {
  return new URL(baseUrl).hostname;
}
