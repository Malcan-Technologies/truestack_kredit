/**
 * Process document_images from Admin KYC webhook and save to Borrower Documents.
 * Fetches images from presigned URLs and stores them in Kredit's storage for permanent access.
 */

import { prisma } from '../../lib/prisma.js';
import { saveDocumentFile, deleteDocumentFile, ensureDocumentsDir } from '../../lib/upload.js';

const DOCUMENT_IMAGE_KEYS = [
  'DIRECTOR_IC_FRONT',
  'DIRECTOR_IC_BACK',
  'DIRECTOR_PASSPORT',
  'SELFIE_LIVENESS',
  'IC_FRONT',
  'IC_BACK',
  'PASSPORT',
] as const;

/** Map payload key to Kredit category based on borrower type */
function payloadKeyToCategory(
  payloadKey: string,
  borrowerType: 'INDIVIDUAL' | 'CORPORATE'
): string | null {
  if (borrowerType === 'CORPORATE') {
    const corporateMap: Record<string, string> = {
      DIRECTOR_IC_FRONT: 'DIRECTOR_IC_FRONT',
      DIRECTOR_IC_BACK: 'DIRECTOR_IC_BACK',
      DIRECTOR_PASSPORT: 'DIRECTOR_PASSPORT',
      SELFIE_LIVENESS: 'SELFIE_LIVENESS',
    };
    return corporateMap[payloadKey] ?? null;
  }
  // Individual: map DIRECTOR_* to individual categories, or use as-is for IC_FRONT etc.
  const individualMap: Record<string, string> = {
    DIRECTOR_IC_FRONT: 'IC_FRONT',
    DIRECTOR_IC_BACK: 'IC_BACK',
    DIRECTOR_PASSPORT: 'PASSPORT',
    SELFIE_LIVENESS: 'SELFIE_LIVENESS',
    IC_FRONT: 'IC_FRONT',
    IC_BACK: 'IC_BACK',
    PASSPORT: 'PASSPORT',
  };
  return individualMap[payloadKey] ?? null;
}

function getExtensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };
  return map[mimeType?.toLowerCase()] ?? '.jpg';
}

export type DocumentImagesPayload = Record<string, { url?: string }>;

type DirectorDocumentUrls = {
  icFrontUrl?: string | null;
  icBackUrl?: string | null;
  selfieUrl?: string | null;
  verificationDetailUrl?: string | null;
  updatedAt?: string;
} | null;

function isInternalStoredPath(value: string): boolean {
  return value.startsWith('/uploads/') || value.startsWith('/api/uploads/') || value.startsWith('s3://');
}

async function persistDirectorImageUrl(params: {
  sourceUrl: string | null | undefined;
  previousStoredPath: string | null | undefined;
  tenantId: string;
  borrowerId: string;
  directorId: string;
  slot: 'ic-front' | 'ic-back' | 'selfie';
}): Promise<string | null> {
  const { sourceUrl, previousStoredPath, tenantId, borrowerId, directorId, slot } = params;
  if (!sourceUrl || typeof sourceUrl !== 'string') {
    return previousStoredPath ?? null;
  }

  if (isInternalStoredPath(sourceUrl)) {
    return sourceUrl;
  }

  try {
    const res = await fetch(sourceUrl, { method: 'GET' });
    if (!res.ok) {
      console.warn(`[Webhook/DocumentImages] Failed to fetch director ${slot}: ${res.status}`);
      return previousStoredPath ?? null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const ext = getExtensionFromMime(contentType);

    ensureDocumentsDir();
    const { path: filePath } = await saveDocumentFile(
      buffer,
      tenantId,
      `${borrowerId}-${directorId}-${slot}`,
      ext
    );

    if (previousStoredPath && previousStoredPath !== filePath && isInternalStoredPath(previousStoredPath)) {
      await deleteDocumentFile(previousStoredPath);
    }

    return filePath;
  } catch (err) {
    console.error(`[Webhook/DocumentImages] Error persisting director ${slot}:`, err);
    return previousStoredPath ?? null;
  }
}

export async function processCorporateDirectorDocumentUrls(params: {
  tenantId: string;
  borrowerId: string;
  directorId: string;
  icFrontUrl?: string | null;
  icBackUrl?: string | null;
  selfieUrl?: string | null;
  verificationDetailUrl?: string | null;
  existingUrls?: DirectorDocumentUrls;
}): Promise<DirectorDocumentUrls> {
  const {
    tenantId,
    borrowerId,
    directorId,
    icFrontUrl,
    icBackUrl,
    selfieUrl,
    verificationDetailUrl,
    existingUrls,
  } = params;

  const persistedIcFront = await persistDirectorImageUrl({
    sourceUrl: icFrontUrl,
    previousStoredPath: existingUrls?.icFrontUrl ?? null,
    tenantId,
    borrowerId,
    directorId,
    slot: 'ic-front',
  });
  const persistedIcBack = await persistDirectorImageUrl({
    sourceUrl: icBackUrl,
    previousStoredPath: existingUrls?.icBackUrl ?? null,
    tenantId,
    borrowerId,
    directorId,
    slot: 'ic-back',
  });
  const persistedSelfie = await persistDirectorImageUrl({
    sourceUrl: selfieUrl,
    previousStoredPath: existingUrls?.selfieUrl ?? null,
    tenantId,
    borrowerId,
    directorId,
    slot: 'selfie',
  });

  const detailUrl = verificationDetailUrl ?? existingUrls?.verificationDetailUrl ?? null;
  const hasAny = persistedIcFront ?? persistedIcBack ?? persistedSelfie ?? detailUrl;
  if (!hasAny) {
    return null;
  }

  return {
    icFrontUrl: persistedIcFront,
    icBackUrl: persistedIcBack,
    selfieUrl: persistedSelfie,
    verificationDetailUrl: detailUrl,
    updatedAt: new Date().toISOString(),
  };
}

export async function processDocumentImagesFromWebhook(params: {
  borrowerId: string;
  tenantId: string;
  borrowerType: 'INDIVIDUAL' | 'CORPORATE';
  documentImages: DocumentImagesPayload;
}): Promise<void> {
  const { borrowerId, tenantId, borrowerType, documentImages } = params;

  if (!documentImages || typeof documentImages !== 'object') {
    return;
  }

  for (const payloadKey of Object.keys(documentImages)) {
    if (!DOCUMENT_IMAGE_KEYS.includes(payloadKey as (typeof DOCUMENT_IMAGE_KEYS)[number])) {
      continue;
    }

    const category = payloadKeyToCategory(payloadKey, borrowerType);
    if (!category) {
      continue;
    }

    const entry = documentImages[payloadKey];
    const url = entry?.url;
    if (!url || typeof url !== 'string') {
      continue;
    }

    try {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        console.warn(`[Webhook/DocumentImages] Failed to fetch ${payloadKey}: ${res.status}`);
        continue;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      const ext = getExtensionFromMime(contentType);

      // Delete existing document for this category (upsert behavior)
      const existingDoc = await prisma.borrowerDocument.findFirst({
        where: { borrowerId, tenantId, category },
      });
      if (existingDoc) {
        await deleteDocumentFile(existingDoc.path);
        await prisma.borrowerDocument.delete({ where: { id: existingDoc.id } });
      }

      ensureDocumentsDir();
      const { filename, path: filePath } = await saveDocumentFile(
        buffer,
        tenantId,
        borrowerId,
        ext
      );

      const originalName = `kyc-${category}${ext}`;

      await prisma.borrowerDocument.create({
        data: {
          tenantId,
          borrowerId,
          filename,
          originalName,
          mimeType: contentType,
          size: buffer.length,
          path: filePath,
          category,
        },
      });
    } catch (err) {
      console.error(`[Webhook/DocumentImages] Error processing ${payloadKey}:`, err);
    }
  }
}
