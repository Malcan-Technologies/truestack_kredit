/**
 * Sends a subscription payment request webhook to admin-truestack.
 * This is triggered when tenant clicks "I've Made the Transfer" in Kredit.
 */

import { config } from '../../lib/config.js';
import { signRequestBody } from './signature.js';

const ENDPOINT = '/api/webhooks/kredit/subscription-payment-request';

export interface SubscriptionPaymentRequestPayload {
  requestId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  plan: 'CORE' | 'CORE_TRUESEND';
  amountCents: number;
  amountMyr: number;
  paymentReference: string;
  periodStart: string;
  periodEnd: string;
  requestedAt: string;
  requestedAddOns?: string[];
  decisionWebhookUrl?: string;
}

export async function notifySubscriptionPaymentRequested(
  payload: SubscriptionPaymentRequestPayload
): Promise<{ delivered: boolean; statusCode?: number; error?: string }> {
  const baseUrl = config.trueIdentity.adminBaseUrl?.replace(/\/$/, '') || '';
  if (!baseUrl) {
    return { delivered: false, error: 'TRUESTACK_ADMIN_URL is not configured' };
  }

  const secret = config.trueIdentity.kreditWebhookSecret;
  if (!secret) {
    return { delivered: false, error: 'KREDIT_WEBHOOK_SECRET is not configured' };
  }

  const body = {
    event: 'subscription.payment.requested',
    request_id: payload.requestId,
    tenant_id: payload.tenantId,
    tenant_slug: payload.tenantSlug,
    tenant_name: payload.tenantName,
    plan: payload.plan,
    amount_cents: payload.amountCents,
    amount_myr: payload.amountMyr,
    payment_reference: payload.paymentReference,
    period_start: payload.periodStart,
    period_end: payload.periodEnd,
    requested_at: payload.requestedAt,
    requested_add_ons: payload.requestedAddOns ?? [],
    decision_webhook_url: payload.decisionWebhookUrl ?? '/api/webhooks/kredit/subscription-payment-decision',
  };

  const rawBody = JSON.stringify(body);
  const { signature, timestamp } = signRequestBody(rawBody, secret);
  const url = `${baseUrl}${ENDPOINT}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-kredit-signature': signature,
        'x-kredit-timestamp': timestamp,
      },
      body: rawBody,
    });

    if (!response.ok) {
      return { delivered: false, statusCode: response.status };
    }
    return { delivered: true, statusCode: response.status };
  } catch (error) {
    return {
      delivered: false,
      error: error instanceof Error ? error.message : 'Webhook dispatch failed',
    };
  }
}
