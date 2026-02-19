/**
 * TrueIdentity Admin Callback Webhook
 *
 * POST /api/webhooks/trueidentity
 *
 * Receives status updates from TrueStack Admin after Innovatif verification.
 * HMAC-SHA256 verification required. Idempotent processing via idempotency key.
 */

import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { verifyCallbackSignature } from '../trueidentity/signature.js';

const router = Router();

interface AdminCallbackPayload {
  idempotencyKey: string;
  sessionId: string;
  status: string;
  result?: string;
  rejectMessage?: string;
}

/**
 * POST /api/webhooks/trueidentity
 *
 * Registered with express.raw() in index.ts to preserve raw body for HMAC verification.
 */
router.post('/', async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    const signatureHeader = req.headers['x-trueidentity-signature'] as string | undefined;
    const timestampHeader = req.headers['x-trueidentity-timestamp'] as string | undefined;

    const secret = config.trueIdentity.callbackWebhookSecret;
    if (!secret) {
      console.error('[TrueIdentity Webhook] Callback secret not configured');
      return res.status(500).json({ success: false, error: 'Webhook not configured' });
    }

    const valid = verifyCallbackSignature(
      rawBody,
      signatureHeader,
      secret,
      timestampHeader,
      config.trueIdentity.timestampMaxAgeMs
    );
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }

    let payload: AdminCallbackPayload;
    try {
      payload = JSON.parse(rawBody) as AdminCallbackPayload;
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid JSON' });
    }

    const { idempotencyKey, sessionId, status, result, rejectMessage } = payload;
    if (!idempotencyKey || !sessionId || !status) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const existing = await prisma.trueIdentityWebhookEvent.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (existing.status === 'COMPLETED') {
        return res.status(200).json({ success: true, processed: false, reason: 'idempotent' });
      }
      if (existing.status === 'FAILED') {
        return res.status(200).json({ success: true, processed: false, reason: 'previous_failure' });
      }
    }

    await prisma.trueIdentityWebhookEvent.upsert({
      where: { idempotencyKey },
      create: {
        idempotencyKey,
        rawPayload: payload as object,
        signatureHeader: signatureHeader ?? null,
        timestampHeader: timestampHeader ?? null,
        status: 'PENDING',
      },
      update: {},
    });

    const session = await prisma.trueIdentitySession.findUnique({
      where: { adminSessionId: sessionId },
      include: { borrower: true },
    });

    if (!session) {
      await prisma.trueIdentityWebhookEvent.update({
        where: { idempotencyKey },
        data: { status: 'FAILED', errorMessage: 'Session not found', processedAt: new Date() },
      });
      return res.status(200).json({ success: true, processed: false, reason: 'session_not_found' });
    }

    const tenantId = session.tenantId;
    const borrowerId = session.borrowerId;

    await prisma.$transaction([
      prisma.trueIdentitySession.update({
        where: { id: session.id },
        data: {
          status,
          result: result ?? null,
          rejectMessage: rejectMessage ?? null,
        },
      }),
      prisma.borrower.update({
        where: { id: borrowerId },
        data: {
          trueIdentityStatus: status,
          trueIdentityResult: result ?? null,
          trueIdentityRejectMessage: rejectMessage ?? null,
          trueIdentityLastWebhookAt: new Date(),
          ...(status === 'completed' && result === 'approved' && {
            documentVerified: true,
            verifiedAt: new Date(),
            verifiedBy: 'TrueIdentity',
          }),
        },
      }),
      prisma.trueIdentityWebhookEvent.update({
        where: { idempotencyKey },
        data: { status: 'COMPLETED', processedAt: new Date(), tenantId },
      }),
    ]);

    if (status === 'completed' && result === 'approved') {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      await prisma.trueIdentityUsageDaily.upsert({
        where: {
          tenantId_usageDate: { tenantId, usageDate: today },
        },
        create: { tenantId, usageDate: today, count: 1 },
        update: { count: { increment: 1 } },
      });
    }

    return res.status(200).json({ success: true, processed: true });
  } catch (error) {
    console.error('[TrueIdentity Webhook] Error:', error);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
});

export default router;
