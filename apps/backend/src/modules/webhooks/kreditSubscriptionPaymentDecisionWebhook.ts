/**
 * Kredit subscription payment decision webhook (Admin -> Kredit)
 *
 * POST /api/webhooks/kredit/subscription-payment-decision
 *
 * Receives decision callbacks for pending subscription payment requests.
 * Uses HMAC signature verification and idempotent processing.
 */

import { Router } from 'express';
import { nanoid } from 'nanoid';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { verifyCallbackSignature } from '../trueidentity/signature.js';

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
};

function toDateRange(dateStr: string) {
  const d = new Date(dateStr);
  const gte = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

function addOneMonth(value: Date): Date {
  const next = new Date(value);
  next.setMonth(next.getMonth() + 1);
  return next;
}

function normalizeRequestedAddOns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry.length > 0);
  return [...new Set(normalized)];
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
      include: {
        tenant: {
          select: {
            id: true,
            slug: true,
            name: true,
            email: true,
            contactNumber: true,
            registrationNumber: true,
            trueIdentityTenantSyncedAt: true,
            subscribedAt: true,
          },
        },
      },
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

    if (payload.status === 'approved') {
      await prisma.$transaction(async (tx) => {
        const startRange = toDateRange(payload.period_start ?? requestRecord.periodStart.toISOString());
        const endRange = toDateRange(payload.period_end ?? requestRecord.periodEnd.toISOString());

        let invoice = requestRecord.invoiceId
          ? await tx.invoice.findUnique({ where: { id: requestRecord.invoiceId } })
          : null;

        if (!invoice) {
          invoice = await tx.invoice.findFirst({
            where: {
              tenantId: requestRecord.tenantId,
              periodStart: { gte: startRange.gte, lt: startRange.lt },
              periodEnd: { gte: endRange.gte, lt: endRange.lt },
            },
            orderBy: { issuedAt: 'desc' },
          });
        }

        if (!invoice) {
          const invoiceNumber = `INV-${requestRecord.tenantId.slice(0, 6).toUpperCase()}-${nanoid(6).toUpperCase()}`;
          invoice = await tx.invoice.create({
            data: {
              tenantId: requestRecord.tenantId,
              invoiceNumber,
              amount: requestRecord.amountMyr,
              status: 'PAID',
              periodStart: requestRecord.periodStart,
              periodEnd: requestRecord.periodEnd,
              dueAt: requestRecord.periodEnd,
              paidAt: decidedAt,
            },
          });
        } else {
          invoice = await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              amount: requestRecord.amountMyr,
              status: 'PAID',
              paidAt: decidedAt,
            },
          });
        }

        const receiptReference = `Subscription payment request ${requestRecord.requestId}`;
        const existingReceipt = await tx.receipt.findFirst({
          where: {
            tenantId: requestRecord.tenantId,
            invoiceId: invoice.id,
            reference: receiptReference,
          },
        });

        if (!existingReceipt) {
          await tx.receipt.create({
            data: {
              tenantId: requestRecord.tenantId,
              invoiceId: invoice.id,
              amount: requestRecord.amountMyr,
              paidAt: decidedAt,
              reference: receiptReference,
            },
          });
        }

        const existingSubscription = await tx.subscription.findUnique({
          where: { tenantId: requestRecord.tenantId },
        });
        const periodAnchor = existingSubscription && existingSubscription.currentPeriodEnd > decidedAt
          ? existingSubscription.currentPeriodEnd
          : decidedAt;
        const newPeriodStart = periodAnchor;
        const newPeriodEnd = addOneMonth(periodAnchor);

        if (existingSubscription) {
          await tx.subscription.update({
            where: { tenantId: requestRecord.tenantId },
            data: {
              status: 'ACTIVE',
              currentPeriodStart: newPeriodStart,
              currentPeriodEnd: newPeriodEnd,
              gracePeriodEnd: null,
            },
          });
        } else {
          await tx.subscription.create({
            data: {
              tenantId: requestRecord.tenantId,
              plan: 'standard',
              status: 'ACTIVE',
              currentPeriodStart: newPeriodStart,
              currentPeriodEnd: newPeriodEnd,
            },
          });
        }

        await tx.tenant.update({
          where: { id: requestRecord.tenantId },
          data: {
            subscriptionStatus: 'PAID',
            subscriptionAmount: requestRecord.amountCents,
            subscribedAt: requestRecord.tenant.subscribedAt ?? decidedAt,
          },
        });

        const addOnsToActivate = new Set<string>();
        if (requestRecord.plan === 'CORE_TRUESEND') addOnsToActivate.add('TRUESEND');
        for (const addOnType of normalizeRequestedAddOns(requestRecord.requestedAddOns)) {
          if (addOnType === 'TRUESEND' || addOnType === 'TRUEIDENTITY') {
            addOnsToActivate.add(addOnType);
          }
        }

        for (const addOnType of addOnsToActivate) {
          await tx.tenantAddOn.upsert({
            where: {
              tenantId_addOnType: {
                tenantId: requestRecord.tenantId,
                addOnType,
              },
            },
            create: {
              tenantId: requestRecord.tenantId,
              addOnType,
              status: 'ACTIVE',
            },
            update: {
              status: 'ACTIVE',
              enabledAt: decidedAt,
              cancelledAt: null,
            },
          });
        }

        await tx.subscriptionPaymentRequest.update({
          where: { id: requestRecord.id },
          data: {
            status: 'APPROVED',
            approvedAt: decidedAt,
            rejectedAt: null,
            rejectionReason: null,
            decisionReceivedAt: decidedAt,
            decisionMetadata: payload as unknown as object,
            invoiceId: invoice.id,
          },
        });

        await tx.billingEvent.create({
          data: {
            tenantId: requestRecord.tenantId,
            eventType: 'PAYMENT_RECEIVED',
            metadata: {
              source: 'subscription_payment_decision_webhook',
              requestId: requestRecord.requestId,
              invoiceId: invoice.id,
              decidedAt: decidedAt.toISOString(),
            },
          },
        });
      });

      if (!requestRecord.tenant.trueIdentityTenantSyncedAt) {
        const { notifyTenantCreated } = await import('../trueidentity/tenantCreatedWebhook.js');
        const sent = await notifyTenantCreated({
          tenantId: requestRecord.tenantId,
          tenantSlug: requestRecord.tenant.slug,
          tenantName: requestRecord.tenant.name,
          contactEmail: requestRecord.tenant.email ?? undefined,
          contactPhone: requestRecord.tenant.contactNumber ?? undefined,
          companyRegistration: requestRecord.tenant.registrationNumber ?? undefined,
          webhookUrl: '/api/webhooks/trueidentity',
        });
        if (sent) {
          await prisma.tenant.update({
            where: { id: requestRecord.tenantId },
            data: { trueIdentityTenantSyncedAt: new Date() },
          });
        }
      }
    } else {
      await prisma.subscriptionPaymentRequest.update({
        where: { id: requestRecord.id },
        data: {
          status: 'REJECTED',
          rejectedAt: decidedAt,
          rejectionReason: payload.rejection_reason || 'Rejected by admin',
          decisionReceivedAt: decidedAt,
          decisionMetadata: payload as unknown as object,
        },
      });
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
