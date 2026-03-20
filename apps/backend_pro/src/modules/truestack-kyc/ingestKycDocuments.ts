/**
 * Download TrueStack KYC session images (presigned URLs) and store as BorrowerDocument rows.
 * Replaces any previous imports prefixed with TRUESTACK_KYC_DOC_PREFIX for this borrower.
 */

import type { PrismaClient } from '@prisma/client';
import type { KycSessionDetailResponse } from './publicApiClient.js';
import {
  saveDocumentFile,
  MAX_DOCUMENT_SIZE,
  deleteDocumentFile,
  ensureDocumentsDir,
} from '../../lib/upload.js';

export const TRUESTACK_KYC_DOC_PREFIX = 'TrueStack KYC —';

type BorrowerKind = 'INDIVIDUAL' | 'CORPORATE';

/** API keys from refresh/get session (snake_case per TrueStack docs). */
const IMAGE_KEYS = ['front_document', 'back_document', 'face_image', 'best_frame'] as const;
type ImageKey = (typeof IMAGE_KEYS)[number];

function mapKeyToCategory(key: ImageKey, borrowerType: BorrowerKind): { category: string; label: string } {
  if (borrowerType === 'CORPORATE') {
    switch (key) {
      case 'front_document':
        return { category: 'DIRECTOR_IC_FRONT', label: `${TRUESTACK_KYC_DOC_PREFIX} IC front` };
      case 'back_document':
        return { category: 'DIRECTOR_IC_BACK', label: `${TRUESTACK_KYC_DOC_PREFIX} IC back` };
      case 'face_image':
        return { category: 'OTHER', label: `${TRUESTACK_KYC_DOC_PREFIX} Face from IC` };
      case 'best_frame':
        return { category: 'SELFIE_LIVENESS', label: `${TRUESTACK_KYC_DOC_PREFIX} Liveness selfie` };
      default:
        return { category: 'OTHER', label: `${TRUESTACK_KYC_DOC_PREFIX} Image` };
    }
  }
  switch (key) {
    case 'front_document':
      return { category: 'IC_FRONT', label: `${TRUESTACK_KYC_DOC_PREFIX} IC front` };
    case 'back_document':
      return { category: 'IC_BACK', label: `${TRUESTACK_KYC_DOC_PREFIX} IC back` };
    case 'face_image':
      return { category: 'OTHER', label: `${TRUESTACK_KYC_DOC_PREFIX} Face from IC` };
    case 'best_frame':
      return { category: 'SELFIE_LIVENESS', label: `${TRUESTACK_KYC_DOC_PREFIX} Liveness selfie` };
    default:
      return { category: 'OTHER', label: `${TRUESTACK_KYC_DOC_PREFIX} Image` };
  }
}

function collectImageUrls(detail: KycSessionDetailResponse): Partial<Record<ImageKey, string>> {
  const out: Partial<Record<ImageKey, string>> = {};
  const merge = (obj: Record<string, unknown> | undefined) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key of IMAGE_KEYS) {
      const v = obj[key];
      if (typeof v === 'string' && (v.startsWith('http://') || v.startsWith('https://'))) {
        out[key] = v;
      }
    }
  };
  merge(detail.images as Record<string, unknown> | undefined);
  merge(detail.documents as Record<string, unknown> | undefined);
  return out;
}

async function fetchUrlToBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string; ext: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching image`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_DOCUMENT_SIZE) {
      throw new Error(`Image exceeds ${MAX_DOCUMENT_SIZE} bytes`);
    }
    const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
    let ext = '.jpg';
    if (ct.includes('png')) ext = '.png';
    else if (ct.includes('webp')) ext = '.webp';
    else if (ct.includes('jpeg') || ct.includes('jpg')) ext = '.jpg';
    return { buffer: buf, mimeType: ct || 'image/jpeg', ext };
  } finally {
    clearTimeout(t);
  }
}

/**
 * After a completed approved KYC session, pull images from refresh payload and save as borrower documents.
 */
export async function ingestTruestackKycDocuments(
  prisma: PrismaClient,
  tenantId: string,
  borrowerId: string,
  borrowerType: BorrowerKind,
  detail: KycSessionDetailResponse
): Promise<{ created: number; errors: string[] }> {
  const urls = collectImageUrls(detail);
  const errors: string[] = [];
  let created = 0;

  const keys = IMAGE_KEYS.filter((k) => Boolean(urls[k]));
  if (keys.length === 0) {
    return { created: 0, errors: [] };
  }

  const existing = await prisma.borrowerDocument.findMany({
    where: {
      borrowerId,
      tenantId,
      originalName: { startsWith: TRUESTACK_KYC_DOC_PREFIX },
    },
  });
  for (const doc of existing) {
    try {
      await deleteDocumentFile(doc.path);
    } catch (e) {
      console.warn('[TruestackKyc ingest] Failed to delete old file', doc.path, e);
    }
  }
  if (existing.length > 0) {
    await prisma.borrowerDocument.deleteMany({
      where: { id: { in: existing.map((d) => d.id) } },
    });
  }

  ensureDocumentsDir();

  for (const key of keys) {
    const url = urls[key]!;
    const { category, label } = mapKeyToCategory(key, borrowerType);
    try {
      const { buffer, mimeType, ext } = await fetchUrlToBuffer(url);
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        errors.push(`${key}: unsupported type ${mimeType}`);
        continue;
      }
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
      const { filename, path: filePath } = await saveDocumentFile(buffer, tenantId, borrowerId, safeExt);
      await prisma.borrowerDocument.create({
        data: {
          tenantId,
          borrowerId,
          filename,
          originalName: label,
          mimeType,
          size: buffer.length,
          path: filePath,
          category,
        },
      });
      created += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${key}: ${msg}`);
      console.error('[TruestackKyc ingest]', key, msg);
    }
  }

  return { created, errors };
}
