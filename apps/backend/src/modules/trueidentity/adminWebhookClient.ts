/**
 * Client for calling TrueStack Admin verification-request webhook.
 * Signs the request body with HMAC-SHA256 for Admin to verify.
 */

import { config } from '../../lib/config.js';
import { signRequestBody } from './signature.js';

export interface VerificationRequestPayload {
  tenantId: string;
  borrowerId: string;
  icNumber: string;
  name: string;
  callbackUrl: string;
}

export interface VerificationRequestResponse {
  sessionId: string;
  onboardingUrl: string;
  expiresAt: string; // ISO 8601
}

export async function requestVerificationSession(
  payload: VerificationRequestPayload
): Promise<VerificationRequestResponse> {
  const baseUrl = config.trueIdentity.adminBaseUrl?.replace(/\/$/, '') || '';
  if (!baseUrl) {
    throw new Error('TRUEIDENTITY_ADMIN_BASE_URL is not configured');
  }

  const secret = config.trueIdentity.kreditWebhookSecret;
  if (!secret) {
    throw new Error('KREDIT_TRUESTACK_WEBHOOK_SECRET is not configured');
  }

  const rawBody = JSON.stringify(payload);
  const { signature, timestamp } = signRequestBody(rawBody, secret);

  const url = `${baseUrl}/api/webhooks/kredit/verification-request`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-trueidentity-signature': signature,
      'x-trueidentity-timestamp': timestamp,
    },
    body: rawBody,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Admin verification request failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as VerificationRequestResponse;
  if (!data.sessionId || !data.onboardingUrl || !data.expiresAt) {
    throw new Error('Invalid response from Admin verification webhook');
  }

  return data;
}
