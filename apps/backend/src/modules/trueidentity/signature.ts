/**
 * HMAC-SHA256 signing and verification for TrueIdentity webhook flows.
 * Kredit -> Admin: signs raw body with KREDIT_TRUESTACK_WEBHOOK_SECRET
 * Admin -> Kredit: verifies x-trueidentity-signature with shared secret
 */

import { createHmac, timingSafeEqual } from 'crypto';

const SIGNATURE_PREFIX = 'HMAC-SHA256 ';

export function signRequestBody(rawBody: string, secret: string): { signature: string; timestamp: string } {
  const timestamp = String(Date.now());
  const hmac = createHmac('sha256', secret);
  hmac.update(rawBody);
  const digest = hmac.digest('base64');
  return {
    signature: `${SIGNATURE_PREFIX}${digest}`,
    timestamp,
  };
}

export function verifyCallbackSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
  timestampHeader?: string,
  maxAgeMs: number = 300_000
): boolean {
  if (!signatureHeader || !secret) return false;
  if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) return false;

  const expectedDigest = signatureHeader.slice(SIGNATURE_PREFIX.length).trim();
  if (!expectedDigest) return false;

  const hmac = createHmac('sha256', secret);
  hmac.update(rawBody);
  const computedDigest = hmac.digest('base64');

  if (expectedDigest.length !== computedDigest.length) return false;
  if (!timingSafeEqual(Buffer.from(expectedDigest, 'base64'), Buffer.from(computedDigest, 'base64'))) return false;

  if (timestampHeader) {
    const ts = parseInt(timestampHeader, 10);
    if (isNaN(ts)) return false;
    if (Math.abs(Date.now() - ts) > maxAgeMs) return false;
  }
  return true;
}
