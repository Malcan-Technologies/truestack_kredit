/**
 * Kredit subscription dates webhook (Admin -> Kredit)
 *
 * POST /api/webhooks/kredit/subscription-dates
 *
 * Receives admin-approved subscription date edits for a tenant.
 * Uses HMAC signature verification and idempotent processing.
 */

import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { verifyCallbackSignature } from '../trueidentity/signature.js';

const router = Router();

type SubscriptionDatesPayload = {
  event?: string;
  tenant_id?: string;
  subscribed_at?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  grace_period_end?: string | null;
  updated_by?: string;
  updated_at?: string;
};

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return parsed;
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

    let payload: SubscriptionDatesPayload;
    try {
      payload = JSON.parse(rawBody) as SubscriptionDatesPayload;
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }

    if (payload.event !== 'subscription.dates.updated') {
      res.status(200).json({ ok: true, skipped: 'wrong event' });
      return;
    }

    if (!payload.tenant_id || !payload.updated_at) {
      res.status(400).json({ error: 'tenant_id and updated_at are required' });
      return;
    }

    if (!payload.current_period_start || !payload.current_period_end) {
      res.status(400).json({ error: 'current_period_start and current_period_end are required' });
      return;
    }

    const idempotencyKey = `subscription.dates.updated:${payload.tenant_id}:${payload.updated_at}`;
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

    const currentPeriodStart = parseOptionalDate(payload.current_period_start);
    const currentPeriodEnd = parseOptionalDate(payload.current_period_end);
    const subscribedAt = parseOptionalDate(payload.subscribed_at);
    const gracePeriodEnd = parseOptionalDate(payload.grace_period_end);

    if (!currentPeriodStart || !currentPeriodEnd) {
      await failEvent(idempotencyKey, 'current_period_start and current_period_end are required');
      res.status(400).json({ error: 'current_period_start and current_period_end are required' });
      return;
    }

    if (currentPeriodEnd <= currentPeriodStart) {
      await failEvent(idempotencyKey, 'current_period_end must be after current_period_start');
      res.status(400).json({ error: 'current_period_end must be after current_period_start' });
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: payload.tenant_id },
      select: { id: true },
    });

    if (!tenant) {
      await failEvent(idempotencyKey, `Unknown tenant_id: ${payload.tenant_id}`);
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    // TrueKredit Pro does not persist SaaS subscription periods; acknowledge for idempotency.
    await prisma.trueIdentityWebhookEvent.update({
      where: { idempotencyKey },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        errorMessage: null,
        rawPayload: payload as object,
      },
    });

    res.status(200).json({
      ok: true,
      data: {
        tenantId: tenant.id,
        note: 'TrueKredit Pro: subscription dates webhook acknowledged (no subscription rows).',
        subscribedAt: subscribedAt?.toISOString() ?? null,
        currentPeriodStart: currentPeriodStart.toISOString(),
        currentPeriodEnd: currentPeriodEnd.toISOString(),
        gracePeriodEnd: gracePeriodEnd?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error('[Webhook/KreditSubscriptionDates] Error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
