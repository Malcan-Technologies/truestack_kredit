import type { IncomingHttpHeaders } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import { AUTH_COOKIE_PREFIXES } from '@kredit/shared';

const DEFAULT_PREFIX = AUTH_COOKIE_PREFIXES.default;
const ADMIN_PREFIX = AUTH_COOKIE_PREFIXES.admin;
const BORROWER_PREFIX = AUTH_COOKIE_PREFIXES.borrower;
const PREFIXES = [DEFAULT_PREFIX, ADMIN_PREFIX, BORROWER_PREFIX] as const;

function parseCookies(cookieHeader: string | undefined): Array<{ name: string; value: string }> {
  if (!cookieHeader) return [];
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, ...valueParts] = part.split('=');
      return { name: name.trim(), value: valueParts.join('=').trim() };
    })
    .filter((cookie) => cookie.name.length > 0);
}

function isAuthCookieName(name: string): boolean {
  return PREFIXES.some(
    (prefix) => name.startsWith(`${prefix}.`) || name.startsWith(`__Secure-${prefix}.`)
  );
}

function toDefaultAuthCookieName(name: string): string {
  for (const prefix of PREFIXES) {
    if (name.startsWith(`__Secure-${prefix}.`)) {
      return `__Secure-${DEFAULT_PREFIX}.${name.slice(`__Secure-${prefix}.`.length)}`;
    }
    if (name.startsWith(`${prefix}.`)) {
      return `${DEFAULT_PREFIX}.${name.slice(`${prefix}.`.length)}`;
    }
  }
  return name;
}

export function getSessionTokenFromCookie(cookieHeader: string | undefined): string | null {
  for (const cookie of parseCookies(cookieHeader)) {
    if (toDefaultAuthCookieName(cookie.name) === `${DEFAULT_PREFIX}.session_token`) {
      return cookie.value;
    }
  }
  return null;
}

export function normalizeAuthCookieHeader(cookieHeader: string | undefined): string | undefined {
  const cookies = parseCookies(cookieHeader);
  if (cookies.length === 0) return cookieHeader;

  const normalized = new Map<string, string>();
  for (const cookie of cookies) {
    normalized.set(cookie.name, cookie.value);
    if (isAuthCookieName(cookie.name)) {
      normalized.set(toDefaultAuthCookieName(cookie.name), cookie.value);
    }
  }

  return Array.from(normalized.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

export function getBetterAuthHeaders(headers: IncomingHttpHeaders) {
  const normalizedHeaders: IncomingHttpHeaders = { ...headers };
  const normalizedCookie = normalizeAuthCookieHeader(headers.cookie);
  if (normalizedCookie) {
    normalizedHeaders.cookie = normalizedCookie;
  }
  return fromNodeHeaders(normalizedHeaders);
}
