/**
 * TrueIdentity Webhook Handler
 *
 * POST /api/webhooks/trueidentity
 *
 * Public endpoint — receives verification lifecycle events from TrueStack Admin.
 * Validates HMAC signature, processes idempotently, updates borrower/session state.
 *
 * Events: kyc.session.started, kyc.session.processing, kyc.session.completed, kyc.session.expired
 */

import { Router } from 'express';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { verifyCallbackSignature } from '../trueidentity/signature.js';

const router = Router();

const HANDLED_EVENTS = new Set([
  'kyc.session.started',
  'kyc.session.processing',
  'kyc.session.completed',
  'kyc.session.expired',
]);

interface TrueIdentityWebhookPayload {
  event: string;
  session_id?: string;
  ref_id?: string;
  status?: string;
  result?: string | null;
  reject_message?: string | null;
  tenant_id?: string;
  borrower_id?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

function buildIdempotencyKey(payload: TrueIdentityWebhookPayload): string {
  const sessionId = payload.session_id ?? '';
  const event = payload.event ?? '';
  const ts = payload.timestamp ?? '';
  const refId = payload.ref_id ?? '';
  const input = `${event}:${sessionId}:${refId}:${ts}`;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * POST /api/webhooks/trueidentity
 *
 * Registered with express.raw({ type: 'application/json' }) so req.body is a Buffer.
 */
router.post('/', async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);

    const webhookSecret = config.trueIdentity.callbackWebhookSecret;
    if (!webhookSecret) {
      console.error('[Webhook/TrueIdentity] Callback secret not configured');
      res.status(500).json({ error: 'Webhook secret not configured' });
      return;
    }

    const signatureHeader = req.headers['x-trueidentity-signature'] as string | undefined;
    const timestampHeader = req.headers['x-trueidentity-timestamp'] as string | undefined;

    if (!verifyCallbackSignature(
      rawBody,
      signatureHeader,
      webhookSecret,
      timestampHeader,
      config.trueIdentity.timestampMaxAgeMs
    )) {
      console.error('[Webhook/TrueIdentity] Invalid signature or expired timestamp');
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    let payload: TrueIdentityWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as TrueIdentityWebhookPayload;
    } catch {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }

    const event = payload.event;
    if (!event || !HANDLED_EVENTS.has(event)) {
      console.log(`[Webhook/TrueIdentity] Ignoring unhandled event: ${event}`);
      res.status(200).json({ received: true });
      return;
    }

    const idempotencyKey = buildIdempotencyKey(payload);
    const tenantId = payload.tenant_id ?? null;

    let webhookRecord: { id: string; status: string };
    try {
      webhookRecord = await prisma.trueIdentityWebhookEvent.create({
        data: {
          idempotencyKey,
          tenantId,
          rawPayload: payload as object,
          signatureHeader: signatureHeader ?? null,
          timestampHeader: timestampHeader ?? null,
          status: 'PENDING',
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        res.status(200).json({ received: true });
        return;
      }
      throw e;
    }

    const sessionId = payload.session_id;
    const borrowerId = payload.borrower_id ?? payload.ref_id;
    const status = payload.status ?? 'pending';
    const result = payload.result ?? null;
    const rejectMessage = payload.reject_message ?? null;

    if (!sessionId) {
      console.warn('[Webhook/TrueIdentity] No session_id in payload');
      await prisma.trueIdentityWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      res.status(200).json({ received: true });
      return;
    }

    const session = await prisma.trueIdentitySession.findUnique({
      where: { adminSessionId: sessionId },
      include: { borrower: true },
    });

    if (!session) {
      console.warn(`[Webhook/TrueIdentity] No session found for admin_session_id: ${sessionId}`);
      await prisma.trueIdentityWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      res.status(200).json({ received: true });
      return;
    }

    const resolvedBorrowerId = borrowerId || session.borrowerId;
    const resolvedTenantId = tenantId || session.tenantId;

    await prisma.$transaction([
      prisma.trueIdentitySession.update({
        where: { id: session.id },
        data: {
          status,
          result: result ?? undefined,
          rejectMessage: rejectMessage ?? undefined,
          updatedAt: new Date(),
        },
      }),
      prisma.borrower.update({
        where: { id: resolvedBorrowerId },
        data: {
          trueIdentityStatus: status,
          trueIdentityResult: result ?? undefined,
          trueIdentityLastWebhookAt: new Date(),
          trueIdentityRejectMessage: rejectMessage ?? undefined,
          ...(status === 'completed' && result === 'approved'
            ? {
                documentVerified: true,
                verifiedAt: new Date(),
                verifiedBy: 'TrueIdentity',
              }
            : {}),
        },
      }),
      prisma.trueIdentityWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      }),
    ]);

    if (status === 'completed' && result === 'approved') {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      await prisma.trueIdentityUsageDaily.upsert({
        where: {
          tenantId_usageDate: { tenantId: resolvedTenantId, usageDate: today },
        },
        create: { tenantId: resolvedTenantId, usageDate: today, count: 1 },
        update: { count: { increment: 1 } },
      });
    }

    console.log(`[Webhook/TrueIdentity] Processed ${event} for session ${sessionId}`);
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Webhook/TrueIdentity] Error:', error);
    res.status(200).json({ received: true, error: 'Internal processing error' });
  }
});

export default router;
