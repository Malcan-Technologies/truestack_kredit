/**
 * Client for calling TrueStack Admin verification-request webhook.
 * Kredit sends signed POST to Admin; Admin creates Innovatif session and returns onboarding_url synchronously.
 */

import { config } from '../../lib/config.js';
import { signRequestBody } from './signature.js';

const REQUEST_TIMEOUT_MS = 15_000;

export interface VerificationRequestPayload {
  tenant_id: string;
  borrower_id: string;
  document_name: string;
  document_number: string;
  document_type: string;
  borrower_email: string | null;
  metadata: Record<string, unknown>;
  webhook_url?: string;
}

export interface AdminVerificationResponse {
  session_id: string;
  onboarding_url: string;
  status: string;
  expires_at: string; // ISO 8601
}

/**
 * Call Admin verification-request webhook.
 * Signs body with HMAC and sends to {adminBaseUrl}/api/webhooks/kredit/verification-request
 */
export async function requestVerificationSession(
  payload: VerificationRequestPayload,
  webhookCallbackUrl: string
): Promise<AdminVerificationResponse> {
  const baseUrl = config.trueIdentity.adminBaseUrl?.replace(/\/$/, '') || '';
  const secret = config.trueIdentity.kreditWebhookSecret;

  if (!baseUrl) {
    throw new Error('TRUEIDENTITY_ADMIN_BASE_URL is not configured');
  }
  if (!secret) {
    throw new Error('KREDIT_TRUESTACK_WEBHOOK_SECRET is not configured');
  }

  const bodyWithWebhook = { ...payload, webhook_url: webhookCallbackUrl || undefined };
  const rawBody = JSON.stringify(bodyWithWebhook);
  const { signature, timestamp } = signRequestBody(rawBody, secret);

  const url = `${baseUrl}/api/webhooks/kredit/verification-request`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-kredit-signature': signature,
        'x-kredit-timestamp': timestamp,
      },
      body: rawBody,
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      console.error(`[TrueIdentity] Admin webhook error ${res.status}: ${text}`);
      throw new Error(`Admin verification request failed: ${res.status}`);
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON response from Admin');
    }

    const parsed = data as Record<string, unknown>;
    const sessionId = parsed.session_id;
    const onboardingUrl = parsed.onboarding_url;
    const status = parsed.status;
    const expiresAt = parsed.expires_at;

    if (typeof sessionId !== 'string' || !sessionId) {
      throw new Error('Admin response missing session_id');
    }
    if (typeof onboardingUrl !== 'string' || !onboardingUrl) {
      throw new Error('Admin response missing onboarding_url');
    }

    return {
      session_id: sessionId,
      onboarding_url: onboardingUrl,
      status: typeof status === 'string' ? status : 'pending',
      expires_at: typeof expiresAt === 'string' ? expiresAt : new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}
