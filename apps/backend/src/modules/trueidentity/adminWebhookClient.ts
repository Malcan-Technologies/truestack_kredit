/**
 * Client to call TrueStack Admin verification-request webhook.
 * Sends signed payload (Admin contract schema); Admin creates session and returns onboarding_url in response.
 */

import { config } from '../../lib/config.js';
import { signRequestBody } from './signature.js';

const ENDPOINT = '/api/webhooks/kredit/verification-request';

export interface VerificationRequestInput {
  tenantId: string;
  borrowerId: string;
  name: string;
  icNumber: string;
  documentType?: string;
  webhookUrl: string;
  metadata?: Record<string, unknown>;
}

export interface VerificationRequestResponse {
  session_id: string;
  onboarding_url: string;
  status: string;
  expires_at?: string;
}

export async function requestVerificationSession(
  input: VerificationRequestInput
): Promise<VerificationRequestResponse> {
  const baseUrl = config.trueIdentity.adminBaseUrl?.replace(/\/$/, '') || '';
  if (!baseUrl) {
    throw new Error('TRUEIDENTITY_ADMIN_BASE_URL is not configured');
  }

  const secret = config.trueIdentity.kreditWebhookSecret;
  if (!secret) {
    throw new Error('KREDIT_WEBHOOK_SECRET / KREDIT_TRUESTACK_WEBHOOK_SECRET is not configured');
  }

  const body = {
    tenant_id: input.tenantId,
    borrower_id: input.borrowerId,
    document_name: input.name,
    document_number: input.icNumber,
    document_type: input.documentType ?? '1',
    webhook_url: input.webhookUrl,
    metadata: input.metadata ?? {},
  };

  const rawBody = JSON.stringify(body);
  const { signature, timestamp } = signRequestBody(rawBody, secret);

  const url = `${baseUrl}${ENDPOINT}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-kredit-signature': signature,
      'x-kredit-timestamp': timestamp,
    },
    body: rawBody,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Admin verification request failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as VerificationRequestResponse;
  if (!data.session_id || !data.onboarding_url) {
    throw new Error('Invalid Admin response: missing session_id or onboarding_url');
  }
  return data;
}
