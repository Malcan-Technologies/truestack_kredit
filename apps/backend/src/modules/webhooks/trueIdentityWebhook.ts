/**
 * TrueIdentity (Admin) callback webhook handler
 *
 * POST /api/webhooks/trueidentity
 *
 * Receives KYC session lifecycle events from TrueStack Admin.
 * Verifies HMAC signature, processes idempotently, updates borrower and session.
 *
 * Events: kyc.session.started, kyc.session.processing, kyc.session.completed, kyc.session.expired
 */

import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { verifyCallbackSignature } from '../trueidentity/signature.js';
import { AuditService } from '../compliance/auditService.js';

const router = Router();

const STATUS_MAP: Record<string, string> = {
  'kyc.session.started': 'pending',
  'kyc.session.processing': 'processing',
  'kyc.session.completed': 'completed',
  'kyc.session.expired': 'expired',
  'kyc.session.failed': 'failed',
};

function deriveIdempotencyKey(payload: {
  event?: string;
  session_id?: string;
  borrower_id?: string;
  tenant_id?: string;
  timestamp?: string;
}): string {
  const event = payload.event ?? '';
  const sessionId = payload.session_id ?? '';
  const borrowerId = payload.borrower_id ?? '';
  const tenantId = payload.tenant_id ?? '';
  const ts = payload.timestamp ?? '';
  return `${event}:${sessionId}:${borrowerId}:${tenantId}:${ts}`;
}

/**
 * POST /api/webhooks/trueidentity
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
      console.error('[Webhook/TrueIdentity] Callback secret not configured');
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
      console.error('[Webhook/TrueIdentity] Invalid signature or expired timestamp');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const payload = JSON.parse(rawBody) as {
      event?: string;
      session_id?: string;
      tenant_id?: string;
      borrower_id?: string;
      timestamp?: string;
      status?: string;
      result?: string;
      reject_message?: string;
    };

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
          rawPayload: payload as object,
          signatureHeader: signatureHeader ?? null,
          timestampHeader: timestampHeader ?? null,
          status: 'PENDING',
        },
      });
    }

    const event = payload.event ?? '';
    const status = STATUS_MAP[event] ?? payload.status ?? null;
    const result = payload.result ?? null;
    const rejectMessage = payload.reject_message ?? null;
    const sessionId = payload.session_id ?? '';
    const payloadBorrowerId = payload.borrower_id ?? '';
    const payloadTenantId = payload.tenant_id ?? null;

    const session = await prisma.trueIdentitySession.findUnique({
      where: { adminSessionId: sessionId },
      include: { borrower: true },
    });

    const borrowerId = session?.borrowerId ?? payloadBorrowerId;
    const tenantId = session?.tenantId ?? payloadTenantId;

    if (borrowerId && tenantId) {
      const updateData: Record<string, unknown> = {
        trueIdentityStatus: status,
        trueIdentityLastWebhookAt: new Date(),
      };
      if (result) updateData.trueIdentityResult = result;
      if (rejectMessage) updateData.trueIdentityRejectMessage = rejectMessage;
      if (status === 'completed' && result === 'approved') {
        updateData.documentVerified = true;
        updateData.verifiedAt = new Date();
        updateData.verifiedBy = 'TrueIdentity';
      }

      const borrower = await prisma.borrower.findFirst({
        where: { id: borrowerId, tenantId },
      });
      if (borrower) {
        await prisma.borrower.update({
          where: { id: borrowerId },
          data: updateData as Parameters<typeof prisma.borrower.update>[0]['data'],
        });
      }

      if (session) {
        await prisma.trueIdentitySession.update({
          where: { adminSessionId: sessionId },
          data: {
            status: status ?? undefined,
            result: result ?? undefined,
            rejectMessage: rejectMessage ?? undefined,
          },
        });
      }

      if (tenantId) {
        await AuditService.log({
          tenantId,
          action: 'TRUEIDENTITY_WEBHOOK',
          entityType: 'Borrower',
          entityId: borrowerId,
          newData: {
            event,
            status,
            result,
            sessionId,
          },
          ipAddress: req.ip,
        });
      }
    }

    await prisma.trueIdentityWebhookEvent.update({
      where: { idempotencyKey },
      data: {
        tenantId,
        status: 'PROCESSED',
        processedAt: new Date(),
      },
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Webhook/TrueIdentity] Error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
