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
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { getBorrowerVerificationSummary } from '../../lib/verification.js';
import { verifyCallbackSignature } from '../trueidentity/signature.js';
import { AuditService } from '../compliance/auditService.js';
import { recordVerificationComplete } from '../trueidentity/usageService.js';
import {
  processCorporateDirectorDocumentUrls,
  processDocumentImagesFromWebhook,
} from '../trueidentity/documentImagesFromWebhook.js';

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
      document_name?: string;
      document_number?: string;
      ic_front_url?: string;
      ic_back_url?: string;
      selfie_url?: string;
      verification_detail_url?: string;
      metadata?: { ic_front_url?: string; ic_back_url?: string; selfie_url?: string; verification_detail_url?: string };
      document_images?: Record<string, { url?: string }>;
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
        // Corporate: update director's KYC status and verified details
        const director = await prisma.borrowerDirector.findFirst({
          where: { id: directorId, borrowerId },
        });
        if (director) {
          const directorUpdateData = { ...updateData } as Record<string, unknown>;
          // Update director details from verified KYC data (document_name, document_number)
          if (event === 'kyc.session.completed') {
            const docName = payload.document_name?.trim();
            const docNumber = payload.document_number?.trim();
            if (docName) directorUpdateData.name = docName;
            if (docNumber) directorUpdateData.icNumber = docNumber;
          }
          // Persist per-director document URLs on approved completion
          if (event === 'kyc.session.completed' && status === 'completed' && result === 'approved') {
            const imageMap = payload.document_images ?? {};
            const icFront =
              payload.ic_front_url ??
              payload.metadata?.ic_front_url ??
              imageMap.DIRECTOR_IC_FRONT?.url ??
              imageMap.IC_FRONT?.url;
            const icBack =
              payload.ic_back_url ??
              payload.metadata?.ic_back_url ??
              imageMap.DIRECTOR_IC_BACK?.url ??
              imageMap.IC_BACK?.url;
            const selfie =
              payload.selfie_url ??
              payload.metadata?.selfie_url ??
              imageMap.SELFIE_LIVENESS?.url;
            const detailUrl = payload.verification_detail_url ?? payload.metadata?.verification_detail_url;
            const persistedDocUrls = await processCorporateDirectorDocumentUrls({
              tenantId,
              borrowerId,
              directorId,
              icFrontUrl: icFront ?? null,
              icBackUrl: icBack ?? null,
              selfieUrl: selfie ?? null,
              verificationDetailUrl: detailUrl ?? null,
              existingUrls:
                (director.trueIdentityDocumentUrls as {
                  icFrontUrl?: string | null;
                  icBackUrl?: string | null;
                  selfieUrl?: string | null;
                  verificationDetailUrl?: string | null;
                } | null) ?? null,
            });
            if (persistedDocUrls) {
              directorUpdateData.trueIdentityDocumentUrls = persistedDocUrls;
            }
          } else if (result === 'rejected') {
            directorUpdateData.trueIdentityDocumentUrls = Prisma.JsonNull;
          }
          await prisma.borrowerDirector.update({
            where: { id: directorId },
            data: directorUpdateData as Parameters<typeof prisma.borrowerDirector.update>[0]['data'],
          });
          // Sync borrower.verificationStatus (single source of truth) after any director update
          const directorStates = await prisma.borrowerDirector.findMany({
            where: { borrowerId },
            select: {
              id: true,
              name: true,
              trueIdentityStatus: true,
              trueIdentityResult: true,
            },
          });
          const borrowerForSummary = await prisma.borrower.findFirst({
            where: { id: borrowerId, tenantId },
            select: { documentVerified: true },
          });
          const verificationStatus = getBorrowerVerificationSummary({
            borrowerType: 'CORPORATE',
            documentVerified: borrowerForSummary?.documentVerified ?? false,
            trueIdentityStatus: null,
            trueIdentityResult: null,
            directors: directorStates,
          });
          const allDirectorsVerified =
            directorStates.length > 0 &&
            directorStates.every(
              (d) => d.trueIdentityStatus === 'completed' && d.trueIdentityResult === 'approved'
            );
          await prisma.borrower.update({
            where: { id: borrowerId },
            data: {
              verificationStatus,
              ...(allDirectorsVerified && {
                documentVerified: true,
                verifiedAt: new Date(),
                verifiedBy: 'TrueIdentity',
              }),
            },
          });
          if (status === 'completed' && result === 'approved' && allDirectorsVerified) {
            await AuditService.log({
                tenantId,
                action: 'TRUEIDENTITY_ALL_DIRECTORS_VERIFIED',
                entityType: 'Borrower',
                entityId: borrowerId,
                newData: {
                  event,
                  status,
                  result,
                  sessionId,
                  allDirectorsVerified: true,
                  verifiedDirectorId: directorId,
                  directors: directorStates.map((d) => ({
                    id: d.id,
                    name: d.name,
                    status: d.trueIdentityStatus,
                    result: d.trueIdentityResult,
                  })),
                },
                ipAddress: req.ip,
              });
          }
        }
      } else {
        // Individual: update borrower and verified details
        if (status === 'completed' && result === 'approved') {
          (updateData as Record<string, unknown>).documentVerified = true;
          (updateData as Record<string, unknown>).verifiedAt = new Date();
          (updateData as Record<string, unknown>).verifiedBy = 'TrueIdentity';
        }
        // Update borrower details from verified KYC data (document_name, document_number)
        if (event === 'kyc.session.completed') {
          const docName = payload.document_name?.trim();
          const docNumber = payload.document_number?.trim();
          if (docName) (updateData as Record<string, unknown>).name = docName;
          if (docNumber) (updateData as Record<string, unknown>).icNumber = docNumber;
        }
        const borrower = await prisma.borrower.findFirst({
          where: { id: borrowerId, tenantId },
        });
        if (borrower) {
          const isApproved = status === 'completed' && result === 'approved';
          const verificationStatus =
            isApproved || borrower.documentVerified ? 'FULLY_VERIFIED' : 'UNVERIFIED';
          (updateData as Record<string, unknown>).verificationStatus = verificationStatus;
          await prisma.borrower.update({
            where: { id: borrowerId },
            data: updateData as Parameters<typeof prisma.borrower.update>[0]['data'],
          });
        }
      }

      // Process document_images on kyc.session.completed only when approved.
      // Skip for CORPORATE: per-director docs are stored in BorrowerDirector.trueIdentityDocumentUrls
      // (URLs only); borrower-level file upsert would overwrite previous directors' images.
      if (
        event === 'kyc.session.completed' &&
        result === 'approved' &&
        !directorId &&
        payload.document_images &&
        Object.keys(payload.document_images).length > 0
      ) {
        const borrower = await prisma.borrower.findFirst({
          where: { id: borrowerId, tenantId },
        });
        if (borrower && borrower.borrowerType === 'INDIVIDUAL') {
          await processDocumentImagesFromWebhook({
            borrowerId,
            tenantId,
            borrowerType: 'INDIVIDUAL',
            documentImages: payload.document_images,
          });
        }
      }

      if (session) {
        const imageMap = payload.document_images ?? {};
        const icFront =
          payload.ic_front_url ??
          payload.metadata?.ic_front_url ??
          imageMap.DIRECTOR_IC_FRONT?.url ??
          imageMap.IC_FRONT?.url;
        const icBack =
          payload.ic_back_url ??
          payload.metadata?.ic_back_url ??
          imageMap.DIRECTOR_IC_BACK?.url ??
          imageMap.IC_BACK?.url;
        const selfie =
          payload.selfie_url ??
          payload.metadata?.selfie_url ??
          imageMap.SELFIE_LIVENESS?.url;
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
        // When rejected, do not store document URLs and clear any existing ones
        const shouldStoreDocUrls = hasDocUrls && result === 'approved';
        await prisma.trueIdentitySession.update({
          where: { adminSessionId: sessionId },
          data: {
            status: status ?? undefined,
            result: result ?? undefined,
            rejectMessage: rejectMessage ?? undefined,
            ...(shouldStoreDocUrls
              ? { verificationDocumentUrls: docUrls }
              : result === 'rejected'
                ? { verificationDocumentUrls: Prisma.JsonNull }
                : {}),
          },
        });
      }

      // Log to borrower audit trail (shows in borrower timeline).
      // Applies to both individual and corporate (directors) - only start and complete (approved or rejected).
      const shouldLogAudit =
        tenantId &&
        (event === 'kyc.session.started' || event === 'kyc.session.completed');
      if (shouldLogAudit) {
        const auditAction =
          status === 'completed' && result === 'approved'
            ? 'TRUEIDENTITY_VERIFICATION_COMPLETED'
            : status === 'completed' && result === 'rejected'
              ? 'TRUEIDENTITY_VERIFICATION_FAILED'
              : event === 'kyc.session.started'
                ? 'TRUEIDENTITY_VERIFICATION_STARTED'
                : 'TRUEIDENTITY_WEBHOOK';
        const director = directorId
          ? await prisma.borrowerDirector.findFirst({
              where: { id: directorId, borrowerId },
              select: { name: true },
            })
          : null;
        await AuditService.log({
          tenantId,
          action: auditAction,
          entityType: 'Borrower',
          entityId: borrowerId,
          newData: {
            event,
            status,
            result,
            sessionId,
            ...(rejectMessage && { rejectMessage }),
            ...(directorId && {
              directorId,
              directorName: director?.name ?? null,
            }),
          },
          ipAddress: req.ip,
        });
      }

      if (event === 'kyc.session.completed' && status === 'completed' && result === 'approved') {
        // Atomically claim the right to record usage so retries don't double-count
        const claimed = await prisma.trueIdentityWebhookEvent.updateMany({
          where: { idempotencyKey, usageRecordedAt: null },
          data: { usageRecordedAt: new Date(), tenantId },
        });
        if (claimed.count > 0) {
          await recordVerificationComplete(tenantId);
        }
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
