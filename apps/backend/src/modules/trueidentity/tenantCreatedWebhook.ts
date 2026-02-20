/**
 * Calls Admin's tenant-created webhook when a tenant first pays.
 * Admin creates the tenant client with idempotency.
 */

import { config } from '../../lib/config.js';
import { signRequestBody } from './signature.js';

const ENDPOINT = '/api/webhooks/kredit/tenant-created';

export interface TenantCreatedPayload {
  tenantId: string;
  tenantName?: string;
  contactEmail?: string;
  contactPhone?: string;
  companyRegistration?: string;
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
}

export async function notifyTenantCreated(payload: TenantCreatedPayload): Promise<boolean> {
  const baseUrl = config.trueIdentity.adminBaseUrl?.replace(/\/$/, '') || '';
  if (!baseUrl) return false;

  const secret = config.trueIdentity.kreditWebhookSecret;
  if (!secret) return false;

  const body = {
    tenant_id: payload.tenantId,
    tenant_name: payload.tenantName ?? `Kredit Tenant ${payload.tenantId}`,
    contact_email: payload.contactEmail ?? null,
    contact_phone: payload.contactPhone ?? null,
    company_registration: payload.companyRegistration ?? null,
    webhook_url: payload.webhookUrl ?? null,
    metadata: payload.metadata ?? {},
  };

  const rawBody = JSON.stringify(body);
  const { signature, timestamp } = signRequestBody(rawBody, secret);

  const url = `${baseUrl}${ENDPOINT}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-kredit-signature': signature,
        'x-kredit-timestamp': timestamp,
      },
      body: rawBody,
    });
    return res.ok;
  } catch {
    return false;
  }
}
