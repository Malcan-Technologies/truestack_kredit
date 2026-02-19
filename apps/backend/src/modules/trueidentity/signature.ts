/**
 * HMAC-SHA256 signing and verification for TrueIdentity webhook flows.
 *
 * Kredit -> Admin: signs raw body with KREDIT_TRUESTACK_WEBHOOK_SECRET
 * Admin -> Kredit: verifies x-trueidentity-signature with TRUEIDENTITY_WEBHOOK_SHARED_SECRET
 *
 * Header format: x-kredit-signature: HMAC-SHA256 <base64_signature>
 *                x-kredit-timestamp: <unix_epoch_ms>
 */

import { createHmac, timingSafeEqual } from 'crypto';

const SIGNATURE_PREFIX = 'HMAC-SHA256 ';

/**
 * Sign raw body for outgoing request to Admin.
 * Returns { signature: "HMAC-SHA256 <base64>", timestamp: "<unix_epoch_ms>" }
 */
export function signRequestBody(rawBody: string, secret: string): { signature: string; timestamp: string } {
  const timestamp = String(Date.now());
  const payload = rawBody;
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  const digest = hmac.digest('base64');
  return {
    signature: `${SIGNATURE_PREFIX}${digest}`,
    timestamp,
  };
}

/**
 * Verify incoming callback signature.
 * Expects header format: x-trueidentity-signature: HMAC-SHA256 <base64>
 * Optional: x-trueidentity-timestamp for replay protection.
 *
 * @returns true if valid
 */
export function verifyCallbackSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
  timestampHeader?: string,
  maxAgeMs: number = 300_000
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const expectedDigest = signatureHeader.slice(SIGNATURE_PREFIX.length).trim();
  if (!expectedDigest) {
    return false;
  }

  const hmac = createHmac('sha256', secret);
  hmac.update(rawBody);
  const computedDigest = hmac.digest('base64');

  if (expectedDigest.length !== computedDigest.length) {
    return false;
  }
  if (!timingSafeEqual(Buffer.from(expectedDigest, 'base64'), Buffer.from(computedDigest, 'base64'))) {
    return false;
  }

  // Replay protection via timestamp
  if (timestampHeader) {
    const ts = parseInt(timestampHeader, 10);
    if (isNaN(ts)) return false;
    const now = Date.now();
    if (Math.abs(now - ts) > maxAgeMs) {
      return false;
    }
  }

  return true;
}

/**
 * Parse timestamp from optional t= format: t=<timestamp>,v1=<signature>
 * Falls back to separate x-trueidentity-timestamp header if used.
 */
export function extractTimestampFromSignature(signatureHeader: string): string | null {
  const match = signatureHeader.match(/t=(\d+)/);
  return match ? match[1] : null;
}
