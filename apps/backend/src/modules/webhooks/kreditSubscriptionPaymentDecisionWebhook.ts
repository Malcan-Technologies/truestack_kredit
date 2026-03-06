/**
 * Kredit subscription payment decision webhook (Admin -> Kredit)
 *
 * POST /api/webhooks/kredit/subscription-payment-decision
 *
 * Receives decision callbacks for pending subscription payment requests.
 * Uses HMAC signature verification and idempotent processing.
 */

import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { verifyCallbackSignature } from '../trueidentity/signature.js';
import { applyApprovedDecision, applyRejectedDecision, type PaymentDecision } from '../../lib/billingCronService.js';

const router = Router();

type DecisionPayload = {
  event?: string;
  request_id?: string;
  tenant_id?: string;
  status?: 'approved' | 'rejected';
  plan?: string;
  amount_cents?: number;
  amount_myr?: number;
  payment_reference?: string;
  period_start?: string;
  period_end?: string;
  rejection_reason?: string;
  decided_at?: string;
  decided_by?: string;
  billing_type?: 'first_subscription' | 'addon_purchase' | 'renewal' | null;
  requested_add_ons?: string[] | null;
};

function normalizeDecisionBillingType(
  value: string | null | undefined
): 'first_subscription' | 'addon_purchase' | 'renewal' | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'renewal') return 'renewal';
  if (normalized === 'addon_purchase' || normalized === 'add_on_purchase') return 'addon_purchase';
  if (normalized === 'first_subscription') return 'first_subscription';
  if (normalized === 'first') return 'first_subscription';
  return null;
}

router.post('/', async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
  const signatureHeader = req.headers['x-trueidentity-signature'] as string | undefined;
  const timestampHeader = req.headers['x-trueidentity-timestamp'] as string | undefined;
  const secret = config.trueIdentity.callbackWebhookSecret;

  const failEvent = async (idempotencyKey: string | null, errorMessage: string) => {
    if (!idempotencyKey) return;
    await prisma.trueIdentityWebhookEvent.upsert({
      where: { idempotencyKey },
      create: {
        idempotencyKey,
        rawPayload: rawBody as unknown as object,
        signatureHeader: signatureHeader ?? null,
        timestampHeader: timestampHeader ?? null,
        status: 'FAILED',
        errorMessage,
      },
      update: {
        status: 'FAILED',
        errorMessage,
      },
    });
  };

  try {
    if (!secret) {
      res.status(500).json({ error: 'Webhook secret not configured' });
      return;
    }

    const valid = verifyCallbackSignature(
      rawBody,
      signatureHeader,
      secret,
      timestampHeader,
      config.trueIdentity.timestampMaxAgeMs
    );
    if (!valid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    let payload: DecisionPayload;
    try {
      payload = JSON.parse(rawBody) as DecisionPayload;
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }

    if (payload.event !== 'subscription.payment.decision') {
      res.status(200).json({ ok: true, skipped: 'wrong event' });
      return;
    }

    if (!payload.request_id || !payload.status || !payload.tenant_id) {
      res.status(400).json({ error: 'request_id, tenant_id, and status are required' });
      return;
    }

    if (payload.status !== 'approved' && payload.status !== 'rejected') {
      res.status(400).json({ error: 'status must be approved or rejected' });
      return;
    }

    const idempotencyKey = `subscription.payment.decision:${payload.request_id}:${payload.status}:${payload.decided_at ?? ''}`;
    const existingEvent = await prisma.trueIdentityWebhookEvent.findUnique({
      where: { idempotencyKey },
    });
    if (existingEvent?.status === 'PROCESSED') {
      res.status(200).json({ ok: true, processed: 'idempotent' });
      return;
    }

    if (!existingEvent) {
      await prisma.trueIdentityWebhookEvent.create({
        data: {
          idempotencyKey,
          tenantId: payload.tenant_id,
          rawPayload: payload as object,
          signatureHeader: signatureHeader ?? null,
          timestampHeader: timestampHeader ?? null,
          status: 'PENDING',
        },
      });
    }

    const requestRecord = await prisma.subscriptionPaymentRequest.findUnique({
      where: { requestId: payload.request_id },
    });

    if (!requestRecord) {
      await failEvent(idempotencyKey, `Unknown request_id: ${payload.request_id}`);
      res.status(404).json({ error: 'Subscription payment request not found' });
      return;
    }

    if (requestRecord.tenantId !== payload.tenant_id) {
      await failEvent(idempotencyKey, 'Tenant mismatch for request_id');
      res.status(400).json({ error: 'tenant_id does not match request' });
      return;
    }

    if (requestRecord.status === 'APPROVED' && payload.status === 'approved') {
      await prisma.trueIdentityWebhookEvent.update({
        where: { idempotencyKey },
        data: { status: 'PROCESSED', processedAt: new Date(), errorMessage: null },
      });
      res.status(200).json({ ok: true, processed: 'idempotent' });
      return;
    }

    if (requestRecord.status === 'REJECTED' && payload.status === 'rejected') {
      await prisma.trueIdentityWebhookEvent.update({
        where: { idempotencyKey },
        data: { status: 'PROCESSED', processedAt: new Date(), errorMessage: null },
      });
      res.status(200).json({ ok: true, processed: 'idempotent' });
      return;
    }

    const decidedAt = payload.decided_at ? new Date(payload.decided_at) : new Date();
    const decision: PaymentDecision = {
      id: payload.request_id,
      request_id: payload.request_id,
      tenant_id: payload.tenant_id,
      status: payload.status,
      billing_type: normalizeDecisionBillingType(payload.billing_type)
        ?? normalizeDecisionBillingType(requestRecord.billingType),
      approved_at: payload.status === 'approved' ? decidedAt.toISOString() : null,
      rejected_at: payload.status === 'rejected' ? decidedAt.toISOString() : null,
      rejection_reason: payload.rejection_reason ?? null,
      amount_cents: requestRecord.amountCents,
      amount_myr: Number(requestRecord.amountMyr),
      requested_add_ons: payload.requested_add_ons ?? (Array.isArray(requestRecord.requestedAddOns)
        ? (requestRecord.requestedAddOns as string[])
        : []),
      period_start: payload.period_start ?? requestRecord.periodStart.toISOString(),
      period_end: payload.period_end ?? requestRecord.periodEnd.toISOString(),
      updated_at: decidedAt.toISOString(),
    };

    if (payload.status === 'approved') {
      await applyApprovedDecision(decision);
    } else {
      await applyRejectedDecision(decision);
    }

    await prisma.trueIdentityWebhookEvent.update({
      where: { idempotencyKey },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        errorMessage: null,
      },
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Webhook/KreditSubscriptionPaymentDecision] Error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
