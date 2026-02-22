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
      ic_front_url?: string;
      ic_back_url?: string;
      selfie_url?: string;
      verification_detail_url?: string;
      metadata?: { ic_front_url?: string; ic_back_url?: string; selfie_url?: string; verification_detail_url?: string };
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
    const reqPayload = session?.requestPayload as { directorId?: string } | null;
    const directorId = reqPayload?.directorId ?? null;

    if (borrowerId && tenantId) {
      const updateData: Record<string, unknown> = {
        trueIdentityStatus: status,
        trueIdentityLastWebhookAt: new Date(),
      };
      if (result) updateData.trueIdentityResult = result;
      if (rejectMessage) updateData.trueIdentityRejectMessage = rejectMessage;

      if (directorId) {
        // Corporate: update director's KYC status
        const director = await prisma.borrowerDirector.findFirst({
          where: { id: directorId, borrowerId },
        });
        if (director) {
          await prisma.borrowerDirector.update({
            where: { id: directorId },
            data: updateData as Parameters<typeof prisma.borrowerDirector.update>[0]['data'],
          });
          if (status === 'completed' && result === 'approved') {
            await prisma.borrower.update({
              where: { id: borrowerId },
              data: {
                documentVerified: true,
                verifiedAt: new Date(),
                verifiedBy: 'TrueIdentity',
              },
            });
          }
        }
      } else {
        // Individual: update borrower
        if (status === 'completed' && result === 'approved') {
          (updateData as Record<string, unknown>).documentVerified = true;
          (updateData as Record<string, unknown>).verifiedAt = new Date();
          (updateData as Record<string, unknown>).verifiedBy = 'TrueIdentity';
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
      }

      if (session) {
        const icFront = payload.ic_front_url ?? payload.metadata?.ic_front_url;
        const icBack = payload.ic_back_url ?? payload.metadata?.ic_back_url;
        const selfie = payload.selfie_url ?? payload.metadata?.selfie_url;
        const detailUrl = payload.verification_detail_url ?? payload.metadata?.verification_detail_url;
        const hasDocUrls = icFront ?? icBack ?? selfie ?? detailUrl;
        const docUrls = hasDocUrls
          ? {
              icFrontUrl: icFront ?? null,
              icBackUrl: icBack ?? null,
              selfieUrl: selfie ?? null,
              verificationDetailUrl: detailUrl ?? null,
            }
          : undefined;
        await prisma.trueIdentitySession.update({
          where: { adminSessionId: sessionId },
          data: {
            status: status ?? undefined,
            result: result ?? undefined,
            rejectMessage: rejectMessage ?? undefined,
            ...(docUrls && { verificationDocumentUrls: docUrls }),
          },
        });
      }

      if (tenantId) {
        const auditAction =
          status === 'completed' && result === 'approved'
            ? 'TRUEIDENTITY_VERIFICATION_COMPLETED'
            : status === 'completed' && result === 'rejected'
              ? 'TRUEIDENTITY_VERIFICATION_FAILED'
              : event
                ? `TRUEIDENTITY_VERIFICATION_${event.replace('kyc.session.', '').toUpperCase()}`
                : 'TRUEIDENTITY_WEBHOOK';
        await AuditService.log({
          tenantId,
          action: auditAction,
          entityType: directorId ? 'BorrowerDirector' : 'Borrower',
          entityId: directorId ?? borrowerId,
          newData: {
            event,
            status,
            result,
            sessionId,
            ...(rejectMessage && { rejectMessage }),
            ...(directorId && { directorId, borrowerId }),
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
