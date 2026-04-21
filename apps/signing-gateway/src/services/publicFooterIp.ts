/**
 * Resolves the **egress** public IPv4 for this host (what the internet sees for outbound HTTPS).
 * Used in /health and for backend PDF footers — not Docker/container private addresses.
 */

import https from 'node:https';
import { config } from '../config.js';

const IPIFY_URL = 'https://api.ipify.org';
const CACHE_TTL_MS = 10 * 60 * 1000;
const FAIL_CACHE_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

let cache: { value: string | null; expires: number } | null = null;

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function httpsGetText(url: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        body += chunk;
      });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
  });
}

export async function resolvePublicFooterIpv4(): Promise<string | null> {
  const explicit = config.footerPublicIp?.trim();
  if (explicit) {
    return explicit;
  }

  const now = Date.now();
  if (cache && cache.expires > now) {
    return cache.value;
  }

  try {
    const raw = await httpsGetText(IPIFY_URL, FETCH_TIMEOUT_MS);
    const trimmed = raw.trim();
    if (!IPV4_RE.test(trimmed)) {
      cache = { value: null, expires: now + FAIL_CACHE_MS };
      return null;
    }
    cache = { value: trimmed, expires: now + CACHE_TTL_MS };
    return trimmed;
  } catch {
    cache = { value: null, expires: now + FAIL_CACHE_MS };
    return null;
  }
}
