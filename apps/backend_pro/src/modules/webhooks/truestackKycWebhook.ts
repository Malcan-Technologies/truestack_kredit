/**
 * TrueStack public KYC API webhook (Bearer-licensed client).
 * POST /api/webhooks/truestack-kyc
 *
 * Separate from /api/webhooks/trueidentity (TrueKredit ↔ Admin HMAC).
 * @see admin-truestack/docs/TrueStack_KYC_API_Documentation.md
 */

import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { refreshKycSession } from '../truestack-kyc/publicApiClient.js';
import type { KycSessionDetailResponse } from '../truestack-kyc/publicApiClient.js';
import { ingestTruestackKycDocuments } from '../truestack-kyc/ingestKycDocuments.js';
import {
  saveDocumentFile,
  deleteDocumentFile,
  ensureDocumentsDir,
  MAX_DOCUMENT_SIZE,
} from '../../lib/upload.js';

const router = Router();

type KycWebhookPayload = {
  event?: string;
  session_id?: string;
  ref_id?: string;
  status?: string;
  result?: string | null;
  reject_message?: string | null;
  document_name?: string;
  document_number?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
};

function mapEventToStatus(event: string | undefined, payloadStatus: string | undefined): string {
  if (payloadStatus) return payloadStatus;
  switch (event) {
    case 'kyc.session.started':
      return 'pending';
    case 'kyc.session.processing':
      return 'processing';
    case 'kyc.session.completed':
      return 'completed';
    case 'kyc.session.expired':
      return 'expired';
    default:
      return 'pending';
  }
}

async function applyApprovedVerification(borrowerId: string, directorId: string | null): Promise<void> {
  if (directorId) {
    // Per-director KYC: no documentVerified on BorrowerDirector; status lives on TruestackKycSession.
    return;
  }
  await prisma.borrower.update({
    where: { id: borrowerId },
    data: {
      documentVerified: true,
      verifiedAt: new Date(),
      verifiedBy: 'TRUESTACK_KYC_API',
      verificationStatus: 'FULLY_VERIFIED',
    },
  });
}

const STAFF_KYC_DOC_PREFIX = 'TrueStack KYC —';
const STAFF_IMAGE_KEYS = ['front_document', 'back_document', 'face_image', 'best_frame'] as const;

function mapStaffImageKey(key: string): { category: string; label: string } | null {
  switch (key) {
    case 'front_document':
      return { category: 'IC_FRONT', label: `${STAFF_KYC_DOC_PREFIX} IC front` };
    case 'back_document':
      return { category: 'IC_BACK', label: `${STAFF_KYC_DOC_PREFIX} IC back` };
    case 'face_image':
      return { category: 'OTHER', label: `${STAFF_KYC_DOC_PREFIX} Face from IC` };
    case 'best_frame':
      return { category: 'SELFIE_LIVENESS', label: `${STAFF_KYC_DOC_PREFIX} Liveness selfie` };
    default:
      return null;
  }
}

async function ingestStaffKycDocuments(
  tenantId: string,
  profileId: string,
  detail: KycSessionDetailResponse,
): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;

  const images: Record<string, unknown> = {
    ...(detail.images as Record<string, unknown> | undefined),
    ...(detail.documents as Record<string, unknown> | undefined),
  };

  const urls: Partial<Record<string, string>> = {};
  for (const key of STAFF_IMAGE_KEYS) {
    const v = images[key];
    if (typeof v === 'string' && (v.startsWith('http://') || v.startsWith('https://'))) {
      urls[key] = v;
    }
  }

  const keys = STAFF_IMAGE_KEYS.filter(k => Boolean(urls[k]));
  if (keys.length === 0) return { created: 0, errors: [] };

  const existing = await prisma.staffDocument.findMany({
    where: { profileId, tenantId, originalName: { startsWith: STAFF_KYC_DOC_PREFIX } },
  });
  for (const doc of existing) {
    try { await deleteDocumentFile(doc.path); } catch { /* ignore */ }
  }
  if (existing.length > 0) {
    await prisma.staffDocument.deleteMany({ where: { id: { in: existing.map(d => d.id) } } });
  }

  ensureDocumentsDir();

  for (const key of keys) {
    const url = urls[key]!;
    const meta = mapStaffImageKey(key);
    if (!meta) continue;

    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 90_000);
      let buf: Buffer;
      let mimeType: string;
      let ext: string;
      try {
        const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_DOCUMENT_SIZE) throw new Error('Image too large');
        const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
        ext = ct.includes('png') ? '.png' : ct.includes('webp') ? '.webp' : '.jpg';
        mimeType = ct || 'image/jpeg';
      } finally {
        clearTimeout(t);
      }

      const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
      const { filename, path: filePath } = await saveDocumentFile(buf, tenantId, profileId, safeExt);
      await prisma.staffDocument.create({
        data: {
          tenantId,
          profileId,
          filename,
          originalName: meta.label,
          mimeType,
          size: buf.length,
          path: filePath,
          category: meta.category,
        },
      });
      created += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${key}: ${msg}`);
    }
  }

  return { created, errors };
}

async function processStaffKycWebhook(
  externalId: string,
  staffRow: { id: string; tenantId: string; profileId: string; result: string | null; rejectMessage: string | null },
  payload: KycWebhookPayload,
): Promise<void> {
  const status = mapEventToStatus(payload.event, payload.status);
  const result =
    payload.result === 'approved' || payload.result === 'rejected' ? payload.result : staffRow.result;
  const rejectMessage =
    payload.reject_message !== undefined ? payload.reject_message : staffRow.rejectMessage;

  await prisma.staffKycSession.update({
    where: { id: staffRow.id },
    data: {
      status,
      result: status === 'completed' ? result : staffRow.result,
      rejectMessage: status === 'completed' ? rejectMessage : staffRow.rejectMessage,
      lastWebhookAt: new Date(),
    },
  });

  const shouldRefresh =
    Boolean(config.truestackKyc.apiKey) &&
    (payload.event === 'kyc.session.completed' || status === 'completed');

  if (!shouldRefresh) return;

  try {
    const refreshed = await refreshKycSession(externalId);
    const finalStatus = refreshed.status || status;
    const finalResult =
      refreshed.result === 'approved' || refreshed.result === 'rejected' ? refreshed.result : result;

    await prisma.staffKycSession.update({
      where: { id: staffRow.id },
      data: {
        status: finalStatus,
        result: finalResult ?? undefined,
        rejectMessage: refreshed.reject_message ?? rejectMessage ?? undefined,
        lastWebhookAt: new Date(),
      },
    });

    if (finalStatus === 'completed' && finalResult === 'approved') {
      await prisma.staffSigningProfile.update({
        where: { id: staffRow.profileId },
        data: { kycComplete: true },
      });

      const ingestRes = await ingestStaffKycDocuments(
        staffRow.tenantId,
        staffRow.profileId,
        refreshed,
      );
      if (ingestRes.errors.length > 0) {
        console.warn('[Webhook/TruestackKyc/Staff] Document ingest issues:', ingestRes.errors);
      }
      if (ingestRes.created > 0) {
        console.info('[Webhook/TruestackKyc/Staff] Saved KYC images as staff documents:', ingestRes.created);
      }
    }
  } catch (err) {
    console.error('[Webhook/TruestackKyc/Staff] Refresh failed:', err);
  }
}

async function processPayloadAsync(payload: KycWebhookPayload): Promise<void> {
  const externalId = payload.session_id;
  if (!externalId) {
    console.warn('[Webhook/TruestackKyc] Missing session_id');
    return;
  }

  // Check borrower KYC sessions first
  const row = await prisma.truestackKycSession.findUnique({
    where: { externalSessionId: externalId },
  });

  if (!row) {
    // Check staff KYC sessions
    const staffRow = await prisma.staffKycSession.findUnique({
      where: { externalSessionId: externalId },
    });
    if (!staffRow) {
      console.warn('[Webhook/TruestackKyc] Unknown session_id', externalId);
      return;
    }

    await processStaffKycWebhook(externalId, staffRow, payload);
    return;
  }

  const status = mapEventToStatus(payload.event, payload.status);
  const result =
    payload.result === 'approved' || payload.result === 'rejected' ? payload.result : row.result;
  const rejectMessage =
    payload.reject_message !== undefined ? payload.reject_message : row.rejectMessage;

  await prisma.truestackKycSession.update({
    where: { id: row.id },
    data: {
      status,
      result: status === 'completed' ? result : row.result,
      rejectMessage: status === 'completed' ? rejectMessage : row.rejectMessage,
      lastWebhookAt: new Date(),
    },
  });

  const shouldRefresh =
    Boolean(config.truestackKyc.apiKey) &&
    (payload.event === 'kyc.session.completed' || status === 'completed');

  if (!shouldRefresh) {
    return;
  }

  try {
    const refreshed = await refreshKycSession(externalId);
    const finalStatus = refreshed.status || status;
    const finalResult = refreshed.result === 'approved' || refreshed.result === 'rejected'
      ? refreshed.result
      : result;

    await prisma.truestackKycSession.update({
      where: { id: row.id },
      data: {
        status: finalStatus,
        result: finalResult ?? undefined,
        rejectMessage: refreshed.reject_message ?? rejectMessage ?? undefined,
        lastWebhookAt: new Date(),
      },
    });

    if (finalStatus === 'completed' && finalResult === 'approved') {
      await applyApprovedVerification(row.borrowerId, row.directorId);
      const borrower = await prisma.borrower.findUnique({
        where: { id: row.borrowerId },
        select: { borrowerType: true },
      });
      if (borrower) {
        const ingestRes = await ingestTruestackKycDocuments(
          prisma,
          row.tenantId,
          row.borrowerId,
          borrower.borrowerType === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL',
          refreshed
        );
        if (ingestRes.errors.length > 0) {
          console.warn('[Webhook/TruestackKyc] Document ingest issues:', ingestRes.errors);
        }
        if (ingestRes.created > 0) {
          console.info('[Webhook/TruestackKyc] Saved KYC images as borrower documents:', ingestRes.created);
        }
      }
    }
  } catch (err) {
    console.error('[Webhook/TruestackKyc] Refresh after webhook failed:', err);
  }
}

router.post('/', async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    const sigHeader = req.headers['x-webhook-signature'] as string | undefined;

    if (config.truestackKyc.webhookSecret) {
      // Algorithm not documented in-repo; log if header missing. Extend when TrueStack publishes signing spec.
      if (!sigHeader) {
        console.warn('[Webhook/TruestackKyc] TRUESTACK_KYC_WEBHOOK_SECRET set but no X-Webhook-Signature header');
      } else {
        console.warn(
          '[Webhook/TruestackKyc] X-Webhook-Signature received; verification not implemented — confirm algorithm with TrueStack'
        );
      }
    }

    let payload: KycWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as KycWebhookPayload;
    } catch {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }

    res.status(200).json({ received: true });

    setImmediate(() => {
      processPayloadAsync(payload).catch((err) => {
        console.error('[Webhook/TruestackKyc] Async processing error:', err);
      });
    });
  } catch (err) {
    console.error('[Webhook/TruestackKyc]', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
