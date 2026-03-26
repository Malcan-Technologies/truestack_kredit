/**
 * HMAC-SHA256 signing and verification for TrueIdentity webhook flows.
 * Contract: payload = {timestamp}.{rawBody}; algorithm = HMAC-SHA256; encoding = base64.
 * Kredit -> Admin: signs with KREDIT_WEBHOOK_SECRET; x-kredit-signature = raw base64 (no prefix).
 * Admin -> Kredit: verifies x-trueidentity-signature (may include "HMAC-SHA256 " prefix).
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
    signature: digest,
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
  const expectedDigest = signatureHeader.startsWith(SIGNATURE_PREFIX)
    ? signatureHeader.slice(SIGNATURE_PREFIX.length).trim()
    : signatureHeader.trim();
  if (!expectedDigest) return false;

  if (!timestampHeader) return false;
  const ts = parseInt(timestampHeader, 10);
  if (isNaN(ts)) return false;
  if (Math.abs(Date.now() - ts) > maxAgeMs) return false;

  const payload = `${timestampHeader}.${rawBody}`;
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  const computedDigest = hmac.digest('base64');

  let expectedBuf: Buffer;
  let computedBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expectedDigest, 'base64');
    computedBuf = Buffer.from(computedDigest, 'base64');
  } catch {
    return false;
  }
  if (expectedBuf.length !== computedBuf.length) return false;
  if (!timingSafeEqual(expectedBuf, computedBuf)) return false;

  return true;
}
