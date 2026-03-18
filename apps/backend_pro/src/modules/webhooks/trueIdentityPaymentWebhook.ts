/**
 * TrueIdentity payment callback webhook (Admin → Kredit)
 *
 * POST /api/webhooks/trueidentity/payment
 *
 * Receives payment.recorded when Admin marks a tenant billing period as paid.
 * Verifies HMAC, processes idempotently, updates invoice status.
 */

import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { addMonthsClamped } from '../../lib/math.js';
import { verifyCallbackSignature } from '../trueidentity/signature.js';

const router = Router();

function deriveIdempotencyKey(payload: {
  event?: string;
  tenant_id?: string;
  period_start?: string;
  period_end?: string;
  timestamp?: string;
}): string {
  const event = payload.event ?? '';
  const tenantId = payload.tenant_id ?? '';
  const periodStart = payload.period_start ?? '';
  const periodEnd = payload.period_end ?? '';
  const ts = payload.timestamp ?? '';
  return `${event}:${tenantId}:${periodStart}:${periodEnd}:${ts}`;
}

/**
 * POST /api/webhooks/trueidentity/payment
 *
 * Registered with express.raw() before express.json() so req.body is a Buffer.
 */
router.post('/', async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    const signatureHeader = req.headers['x-trueidentity-signature'] as string | undefined;
    const timestampHeader = req.headers['x-trueidentity-timestamp'] as string | undefined;

    const secret = config.trueIdentity.callbackWebhookSecret;
    if (!secret) {
      console.error('[Webhook/TrueIdentityPayment] Callback secret not configured');
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
      console.error('[Webhook/TrueIdentityPayment] Invalid signature or expired timestamp');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const payload = JSON.parse(rawBody) as {
      event?: string;
      tenant_id?: string;
      client_id?: string;
      period_start?: string;
      period_end?: string;
      paid_at?: string;
      paid_amount_myr?: number;
      timestamp?: string;
    };

    if (payload.event !== 'payment.recorded') {
      res.status(200).json({ ok: true, skipped: 'wrong event' });
      return;
    }

    const idempotencyKey = deriveIdempotencyKey(payload);
    const existing = await prisma.trueIdentityWebhookEvent.findUnique({
      where: { idempotencyKey },
    });
    if (existing?.status === 'PROCESSED') {
      res.status(200).json({ ok: true, processed: 'idempotent' });
      return;
    }

    if (!existing) {
      await prisma.trueIdentityWebhookEvent.create({
        data: {
          idempotencyKey,
          tenantId: payload.tenant_id ?? null,
          rawPayload: payload as object,
          signatureHeader: signatureHeader ?? null,
          timestampHeader: timestampHeader ?? null,
          status: 'PENDING',
        },
      });
    }

    const tenantId = payload.tenant_id;
    const periodStart = payload.period_start;
    const periodEnd = payload.period_end;
    const paidAt = payload.paid_at ? new Date(payload.paid_at) : new Date();
    const paidAmountMyr = payload.paid_amount_myr ?? 0;

    if (tenantId && periodStart && periodEnd) {
      // Contract sends date-only (e.g. "2025-02-01"); invoices store DateTime.
      // Match by date range to avoid exact timestamp equality mismatch.
      const toDateRange = (dateStr: string) => {
        const d = new Date(dateStr);
        const gte = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        const lt = new Date(gte);
        lt.setUTCDate(lt.getUTCDate() + 1);
        return { gte, lt };
      };
      const startRange = toDateRange(periodStart);
      const endRange = toDateRange(periodEnd);

      const invoice = await prisma.invoice.findFirst({
        where: {
          tenantId,
          periodStart: { gte: startRange.gte, lt: startRange.lt },
          periodEnd: { gte: endRange.gte, lt: endRange.lt },
          status: { in: ['DRAFT', 'ISSUED', 'OVERDUE'] },
        },
      });

      if (invoice) {
        await prisma.$transaction([
          prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: 'PAID', paidAt },
          }),
          prisma.receipt.create({
            data: {
              tenantId,
              invoiceId: invoice.id,
              amount: paidAmountMyr,
              reference: `TrueIdentity payment ${periodStart}-${periodEnd}`,
            },
          }),
          prisma.billingEvent.create({
            data: {
              tenantId,
              eventType: 'PAYMENT_RECEIVED',
              metadata: {
                source: 'trueidentity_webhook',
                invoiceId: invoice.id,
                paidAt: paidAt.toISOString(),
                paidAmountMyr,
              },
            },
          }),
        ]);

        const subscription = await prisma.subscription.findUnique({
          where: { tenantId },
        });
        if (subscription && (subscription.status === 'GRACE_PERIOD' || subscription.status === 'BLOCKED')) {
          const newPeriodStart = new Date();
          const newPeriodEnd = addMonthsClamped(newPeriodStart, 1);
          await prisma.subscription.update({
            where: { tenantId },
            data: {
              status: 'ACTIVE',
              currentPeriodStart: newPeriodStart,
              currentPeriodEnd: newPeriodEnd,
              gracePeriodEnd: null,
            },
          });
        }
      }
    }

    await prisma.trueIdentityWebhookEvent.update({
      where: { idempotencyKey },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
      },
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Webhook/TrueIdentityPayment] Error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
