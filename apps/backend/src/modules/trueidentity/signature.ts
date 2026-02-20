/**
 * HMAC-SHA256 signing and verification for TrueIdentity webhook flows.
 * Contract: payload = {timestamp}.{rawBody}; algorithm = HMAC-SHA256; encoding = base64.
 * Kredit -> Admin: signs with KREDIT_WEBHOOK_SECRET
 * Admin -> Kredit: verifies x-trueidentity-signature with TRUEIDENTITY_WEBHOOK_SECRET
 */

import { createHmac, timingSafeEqual } from 'crypto';

const SIGNATURE_PREFIX = 'HMAC-SHA256 ';

export function signRequestBody(rawBody: string, secret: string): { signature: string; timestamp: string } {
  const timestamp = String(Date.now());
  const payload = `${timestamp}.${rawBody}`;
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
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

  if (!timestampHeader) return false;
  const ts = parseInt(timestampHeader, 10);
  if (isNaN(ts)) return false;
  if (Math.abs(Date.now() - ts) > maxAgeMs) return false;

  const payload = `${timestampHeader}.${rawBody}`;
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  const computedDigest = hmac.digest('base64');

  if (expectedDigest.length !== computedDigest.length) return false;
  if (!timingSafeEqual(Buffer.from(expectedDigest, 'base64'), Buffer.from(computedDigest, 'base64'))) return false;

  return true;
}
