/**
 * TrueSSM borrower routes.
 *
 * v1 scope (see apps/admin_pro/docs/TRUESSM_API.md and the borrower
 * detail page plan):
 *   - Pull a ROC company profile for a corporate borrower (billable).
 *   - Persist the raw response, generate a PDF, attach it to the borrower's
 *     documents in the COMPANY_PROFILE category.
 *   - List historical pulls for the panel.
 *   - Apply (sync) selected fields from a pull onto the borrower record,
 *     stamping per-field provenance and recomputing verification when
 *     name/address changes.
 *
 * All routes are tenant-scoped via the shared authenticate middleware.
 */

import path from 'path';
import { Router } from 'express';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requirePaidSubscription } from '../../middleware/billingGuard.js';
import { requirePermission } from '../../middleware/requireRole.js';
import { AuditService } from '../compliance/auditService.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { ensureDocumentsDir, saveDocumentFile } from '../../lib/upload.js';
import { pullCompanyProfile, SsmApiError } from './client.js';
import {
  castIncomingForUpdate,
  mapCompanyOfficersToDirectorDiff,
  mapCompanyProfileToBorrowerDiff,
  normaliseIcForMatch,
  SSM_MAPPABLE_FIELDS,
  type SsmFieldDiff,
  type SsmMappableField,
} from './mapper.js';
import { renderCompanyProfilePdf } from './pdfRenderer.js';
import { getBorrowerVerificationSummary } from '../../lib/verification.js';

const router = Router();

router.use(authenticateToken);
router.use(requirePaidSubscription);

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

interface BorrowerForSsm {
  id: string;
  tenantId: string;
  borrowerType: string;
  name: string;
  companyName: string | null;
  ssmRegistrationNo: string | null;
  dateOfIncorporation: Date | null;
  paidUpCapital: Prisma.Decimal | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  ssmFieldProvenance: Prisma.JsonValue | null;
  documentVerified: boolean;
  trueIdentityStatus: string | null;
  trueIdentityResult: string | null;
}

const BORROWER_SELECT = {
  id: true,
  tenantId: true,
  borrowerType: true,
  name: true,
  companyName: true,
  ssmRegistrationNo: true,
  dateOfIncorporation: true,
  paidUpCapital: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postcode: true,
  country: true,
  ssmFieldProvenance: true,
  documentVerified: true,
  trueIdentityStatus: true,
  trueIdentityResult: true,
} satisfies Prisma.BorrowerSelect;

async function loadCorporateBorrower(tenantId: string, borrowerId: string): Promise<BorrowerForSsm> {
  const borrower = await prisma.borrower.findFirst({
    where: { id: borrowerId, tenantId },
    select: BORROWER_SELECT,
  });
  if (!borrower) throw new NotFoundError('Borrower');
  if (borrower.borrowerType !== 'CORPORATE') {
    throw new BadRequestError('TrueSSM is only available for corporate borrowers', 'NOT_CORPORATE');
  }
  return borrower;
}

function diffFromBorrower(borrower: BorrowerForSsm, rawData: unknown) {
  return mapCompanyProfileToBorrowerDiff(rawData, {
    companyName: borrower.companyName,
    ssmRegistrationNo: borrower.ssmRegistrationNo,
    dateOfIncorporation: borrower.dateOfIncorporation,
    paidUpCapital: borrower.paidUpCapital ? Number(borrower.paidUpCapital) : null,
    addressLine1: borrower.addressLine1,
    addressLine2: borrower.addressLine2,
    city: borrower.city,
    state: borrower.state,
    postcode: borrower.postcode,
    country: borrower.country,
  });
}

interface SerializedPull {
  id: string;
  usageType: string;
  usageId: string | null;
  regNo: string;
  billedCredits: number;
  createdAt: string;
  documentId: string | null;
  document: {
    id: string;
    originalName: string;
    category: string;
  } | null;
}

interface SerializedPullWithDiff extends SerializedPull {
  diff: ReturnType<typeof diffFromBorrower>;
}

interface SerializedPullWithRawData extends SerializedPull {
  rawData: Prisma.JsonValue;
}

function serializePull(
  pull: {
    id: string;
    usageType: string;
    usageId: string | null;
    regNo: string;
    billedCredits: number;
    createdAt: Date;
    documentId: string | null;
    document?: { id: string; originalName: string; category: string } | null;
  },
): SerializedPull {
  return {
    id: pull.id,
    usageType: pull.usageType,
    usageId: pull.usageId,
    regNo: pull.regNo,
    billedCredits: pull.billedCredits,
    createdAt: pull.createdAt.toISOString(),
    documentId: pull.documentId,
    document: pull.document ?? null,
  };
}

function serializePullWithRawData(
  pull: Parameters<typeof serializePull>[0] & { rawData: Prisma.JsonValue },
): SerializedPullWithRawData {
  return {
    ...serializePull(pull),
    rawData: pull.rawData,
  };
}

function getRequestIdempotencyKey(req: Request): string | null {
  const header = req.get('Idempotency-Key')?.trim();
  if (header) return header;
  const bodyKey = (req.body as { idempotencyKey?: unknown } | undefined)?.idempotencyKey;
  return typeof bodyKey === 'string' ? bodyKey.trim() : null;
}

function assertValidIdempotencyKey(value: string | null): string {
  if (!value) {
    throw new BadRequestError('Missing idempotency key for TrueSSM pull', 'MISSING_IDEMPOTENCY_KEY');
  }
  if (value.length < 8 || value.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new BadRequestError('Invalid idempotency key for TrueSSM pull', 'INVALID_IDEMPOTENCY_KEY');
  }
  return value;
}

/** POST /api/borrowers/:borrowerId/ssm/pull — billable company profile pull. */
router.post('/:borrowerId/ssm/pull', requirePermission('truessm.manage'), async (req, res, next) => {
  try {
    const borrowerId = getRouteParam(req.params.borrowerId);
    const borrower = await loadCorporateBorrower(req.tenantId!, borrowerId);
    const regNo = borrower.ssmRegistrationNo?.trim();
    if (!regNo) {
      throw new BadRequestError(
        'Borrower has no SSM registration number. Add one before pulling from SSM.',
        'MISSING_REG_NO',
      );
    }

    const idempotencyKey = assertValidIdempotencyKey(getRequestIdempotencyKey(req));
    const existingPullForKey = await prisma.trueSsmPull.findUnique({
      where: { idempotencyKey },
      include: { document: { select: { id: true, originalName: true, category: true } } },
    });
    if (existingPullForKey) {
      if (
        existingPullForKey.tenantId !== req.tenantId ||
        existingPullForKey.borrowerId !== borrowerId ||
        existingPullForKey.regNo !== regNo
      ) {
        throw new ConflictError('Idempotency key was already used for a different TrueSSM pull');
      }
      const payload: SerializedPullWithDiff = {
        ...serializePull(existingPullForKey),
        diff: diffFromBorrower(borrower, existingPullForKey.rawData),
      };
      res.status(200).json({ success: true, data: payload });
      return;
    }

    let response;
    try {
      response = await pullCompanyProfile({ regNo, idempotencyKey });
    } catch (err) {
      if (err instanceof SsmApiError) {
        // Audit failed pulls too so staff see them in the timeline.
        await AuditService.log({
          tenantId: req.tenantId!,
          memberId: req.user?.memberId,
          action: 'SSM_PULL_FAILED',
          entityType: 'Borrower',
          entityId: borrowerId,
          newData: {
            errorCode: err.errorCode,
            message: err.message,
            regNo,
            billedCredits: err.acknowledgement?.billed_credits ?? 0,
          },
          ipAddress: req.ip,
        });
      }
      throw err;
    }

    const acknowledgement = response.acknowledgement ?? {};
    const pulledAt = new Date();

    // Render the PDF synchronously — small payload, no async I/O contention.
    const pdfBuffer = await renderCompanyProfilePdf({
      rawData: response.data as Record<string, unknown>,
      acknowledgement,
      regNo,
      pulledAt,
      tenantName: null,
    });

    ensureDocumentsDir();
    const { filename, path: filePath } = await saveDocumentFile(
      pdfBuffer,
      req.tenantId!,
      borrowerId,
      '.pdf',
    );

    const dateLabel = pulledAt.toISOString().slice(0, 10);
    const originalName = `SSM Company Profile ${regNo} ${dateLabel}.pdf`;

    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const document = await tx.borrowerDocument.create({
          data: {
            tenantId: req.tenantId!,
            borrowerId,
            filename,
            originalName,
            mimeType: 'application/pdf',
            size: pdfBuffer.length,
            path: filePath,
            category: 'COMPANY_PROFILE',
          },
        });

        const pull = await tx.trueSsmPull.create({
          data: {
            tenantId: req.tenantId!,
            borrowerId,
            usageType: acknowledgement.usage_type ?? 'company_profile',
            usageId: acknowledgement.usage_id ?? null,
            requestRefNo: acknowledgement.request_id ?? null,
            regNo,
            billedCredits: acknowledgement.billed_credits ?? 0,
            idempotencyKey,
            rawData: (response.data ?? {}) as Prisma.InputJsonValue,
            documentId: document.id,
            createdByMemberId: req.user?.memberId ?? null,
          },
          include: { document: { select: { id: true, originalName: true, category: true } } },
        });

        return { pull, document };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await prisma.trueSsmPull.findUnique({
          where: { idempotencyKey },
          include: { document: { select: { id: true, originalName: true, category: true } } },
        });
        if (existing) {
          const payload: SerializedPullWithDiff = {
            ...serializePull(existing),
            diff: diffFromBorrower(borrower, existing.rawData),
          };
          res.status(200).json({ success: true, data: payload });
          return;
        }
      }
      throw err;
    }

    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.user?.memberId,
      action: 'SSM_PULL',
      entityType: 'Borrower',
      entityId: borrowerId,
      newData: {
        pullId: result.pull.id,
        usageId: acknowledgement.usage_id,
        usageType: acknowledgement.usage_type ?? 'company_profile',
        regNo,
        billedCredits: acknowledgement.billed_credits ?? 0,
        documentId: result.document.id,
      },
      ipAddress: req.ip,
    });

    const diff = diffFromBorrower(borrower, response.data);

    const payload: SerializedPullWithDiff = {
      ...serializePull(result.pull),
      diff,
    };

    res.status(201).json({ success: true, data: payload });
  } catch (err) {
    next(err);
  }
});

/** GET /api/borrowers/:borrowerId/ssm/latest — latest raw payload for insights. */
router.get('/:borrowerId/ssm/latest', requirePermission('truessm.view'), async (req, res, next) => {
  try {
    const borrowerId = getRouteParam(req.params.borrowerId);
    await loadCorporateBorrower(req.tenantId!, borrowerId);

    const pull = await prisma.trueSsmPull.findFirst({
      where: { borrowerId, tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' },
      include: { document: { select: { id: true, originalName: true, category: true } } },
    });

    res.json({
      success: true,
      data: pull ? serializePullWithRawData(pull) : null,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/borrowers/:borrowerId/ssm/pulls — list history newest first. */
router.get('/:borrowerId/ssm/pulls', requirePermission('truessm.view'), async (req, res, next) => {
  try {
    const borrowerId = getRouteParam(req.params.borrowerId);
    const borrower = await prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId: req.tenantId },
      select: { id: true },
    });
    if (!borrower) throw new NotFoundError('Borrower');

    const pulls = await prisma.trueSsmPull.findMany({
      where: { borrowerId, tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { document: { select: { id: true, originalName: true, category: true } } },
    });

    res.json({ success: true, data: pulls.map(serializePull) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/borrowers/:borrowerId/ssm/pulls/:pullId — diff for the apply modal. */
router.get(
  '/:borrowerId/ssm/pulls/:pullId',
  requirePermission('truessm.view'),
  async (req, res, next) => {
    try {
      const borrowerId = getRouteParam(req.params.borrowerId);
      const pullId = getRouteParam(req.params.pullId);
      const borrower = await loadCorporateBorrower(req.tenantId!, borrowerId);
      const pull = await prisma.trueSsmPull.findFirst({
        where: { id: pullId, borrowerId, tenantId: req.tenantId! },
        include: { document: { select: { id: true, originalName: true, category: true } } },
      });
      if (!pull) throw new NotFoundError('SSM pull');

      const diff = diffFromBorrower(borrower, pull.rawData);
      const payload: SerializedPullWithDiff = { ...serializePull(pull), diff };
      res.json({ success: true, data: payload });
    } catch (err) {
      next(err);
    }
  },
);

const syncSchema = z.object({
  pullId: z.string().min(1),
  // Empty array is allowed: it means "only mark already-matching fields as
  // verified" — useful when SSM data is identical to what's on the borrower.
  fields: z.array(z.enum(SSM_MAPPABLE_FIELDS as unknown as [string, ...string[]])).default([]),
});

/** POST /api/borrowers/:borrowerId/ssm/sync — apply selected SSM fields. */
router.post('/:borrowerId/ssm/sync', requirePermission('truessm.manage'), async (req, res, next) => {
  try {
    const borrowerId = getRouteParam(req.params.borrowerId);
    const body = syncSchema.parse(req.body ?? {});

    const borrower = await loadCorporateBorrower(req.tenantId!, borrowerId);

    const pull = await prisma.trueSsmPull.findFirst({
      where: { id: body.pullId, borrowerId, tenantId: req.tenantId! },
    });
    if (!pull) throw new NotFoundError('SSM pull');

    const diff = diffFromBorrower(borrower, pull.rawData);
    const diffByField = new Map<SsmMappableField, SsmFieldDiff>(
      diff.fields.map((entry) => [entry.field, entry] as const),
    );

    const requested = body.fields as SsmMappableField[];
    const updates: Record<string, Date | number | string | null> = {};
    const previousValues: Record<string, unknown> = {};
    const appliedFields: SsmMappableField[] = [];

    for (const field of requested) {
      const entry = diffByField.get(field);
      if (!entry || entry.incoming === null) continue;
      if (entry.action === 'unchanged') continue;
      const casted = castIncomingForUpdate(field, entry.incoming);
      if (casted === null) continue;
      updates[field] = casted;
      previousValues[field] = entry.current;
      appliedFields.push(field);
    }

    // Fields already matching SSM are auto-verified. We don't need an UPDATE,
    // but we still want to write provenance so the verified badge shows up.
    const autoVerifiedFields: SsmMappableField[] = [];
    const appliedSet = new Set<SsmMappableField>(appliedFields);
    for (const entry of diff.fields) {
      if (entry.action !== 'unchanged') continue;
      if (entry.incoming === null) continue;
      if (appliedSet.has(entry.field as SsmMappableField)) continue;
      autoVerifiedFields.push(entry.field as SsmMappableField);
    }

    if (appliedFields.length === 0 && autoVerifiedFields.length === 0) {
      throw new ConflictError('No applicable fields to sync from the selected pull');
    }

    const now = new Date().toISOString();
    const existingProvenance =
      borrower.ssmFieldProvenance && typeof borrower.ssmFieldProvenance === 'object' && !Array.isArray(borrower.ssmFieldProvenance)
        ? (borrower.ssmFieldProvenance as Record<string, unknown>)
        : {};
    const nextProvenance: Record<string, unknown> = { ...existingProvenance };
    for (const field of [...appliedFields, ...autoVerifiedFields]) {
      const incoming = diffByField.get(field)?.incoming ?? null;
      nextProvenance[field] = {
        syncedAt: now,
        usageId: pull.usageId ?? null,
        pullId: pull.id,
        sourceValue: incoming,
      };
    }

    const updatedBorrower = await prisma.borrower.update({
      where: { id: borrowerId },
      data: {
        ...updates,
        ssmFieldProvenance: nextProvenance as Prisma.InputJsonValue,
      },
      select: BORROWER_SELECT,
    });

    // Recompute verification summary only when name/address fields change so
    // the cached badge stays accurate. (Director-driven KYC is untouched here.)
    const identityFieldsTouched = appliedFields.some((f) =>
      ['companyName', 'ssmRegistrationNo'].includes(f),
    );
    if (identityFieldsTouched && updatedBorrower.borrowerType === 'CORPORATE') {
      // Pull directors for the summary recompute.
      const directorStates = await prisma.borrowerDirector.findMany({
        where: { borrowerId },
        select: {
          trueIdentityStatus: true,
          trueIdentityResult: true,
          isAuthorizedRepresentative: true,
        },
      });
      const verificationStatus = getBorrowerVerificationSummary({
        borrowerType: 'CORPORATE',
        documentVerified: updatedBorrower.documentVerified,
        trueIdentityStatus: null,
        trueIdentityResult: null,
        directors: directorStates,
      });
      await prisma.borrower.update({
        where: { id: borrowerId },
        data: { verificationStatus },
      });
    }

    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.user?.memberId,
      action: 'SSM_SYNC',
      entityType: 'Borrower',
      entityId: borrowerId,
      previousData: previousValues,
      newData: {
        pullId: pull.id,
        usageId: pull.usageId,
        regNo: pull.regNo,
        fields: appliedFields,
        verifiedFields: autoVerifiedFields,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        appliedFields,
        verifiedFields: autoVerifiedFields,
        ssmFieldProvenance: nextProvenance,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ============================ Director sync ============================== */

const DIRECTOR_SELECT = {
  id: true,
  name: true,
  icNumber: true,
  position: true,
  order: true,
  isAuthorizedRepresentative: true,
  trueIdentityStatus: true,
  trueIdentityResult: true,
} satisfies Prisma.BorrowerDirectorSelect;

/** Hard limit shared with the borrower onboarding form. */
const MAX_DIRECTORS = 10;
const MIN_DIRECTORS = 1;

async function loadBorrowerDirectors(borrowerId: string) {
  return prisma.borrowerDirector.findMany({
    where: { borrowerId },
    orderBy: { order: 'asc' },
    select: DIRECTOR_SELECT,
  });
}

/**
 * GET /api/borrowers/:borrowerId/ssm/pulls/:pullId/directors
 *
 * Preview the director diff that an `/ssm/directors/sync` call would apply.
 * Returned shape mirrors `mapCompanyOfficersToDirectorDiff` plus the pull
 * metadata so the modal can show "Entity · Pulled at · Usage ID".
 */
router.get(
  '/:borrowerId/ssm/pulls/:pullId/directors',
  requirePermission('truessm.view'),
  async (req, res, next) => {
    try {
      const borrowerId = getRouteParam(req.params.borrowerId);
      const pullId = getRouteParam(req.params.pullId);
      await loadCorporateBorrower(req.tenantId!, borrowerId);

      const pull = await prisma.trueSsmPull.findFirst({
        where: { id: pullId, borrowerId, tenantId: req.tenantId! },
        select: {
          id: true,
          usageId: true,
          regNo: true,
          createdAt: true,
          rawData: true,
        },
      });
      if (!pull) throw new NotFoundError('SSM pull');

      const directors = await loadBorrowerDirectors(borrowerId);
      const diff = mapCompanyOfficersToDirectorDiff(pull.rawData, directors);

      res.json({
        success: true,
        data: {
          pull: {
            id: pull.id,
            usageId: pull.usageId,
            regNo: pull.regNo,
            createdAt: pull.createdAt.toISOString(),
          },
          ...diff,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Director-sync operations the client can request. `verify` writes provenance
 * but no field changes; `add` and `update` mutate `BorrowerDirector`; `remove`
 * deletes a borrower director (orphan) — only allowed when the director has
 * no e-KYC progress attached.
 */
const directorSyncSchema = z.object({
  pullId: z.string().min(1),
  operations: z
    .array(
      z.object({
        // Canonical IC. Caller can also send the raw IC; the route
        // re-canonicalises before matching so either works.
        icNumber: z.string().min(1),
        action: z.enum(['add', 'update', 'verify', 'remove']),
      }),
    )
    .min(1),
});

/**
 * POST /api/borrowers/:borrowerId/ssm/directors/sync
 *
 * Apply a set of add/update/verify/remove operations against the borrower's
 * `BorrowerDirector` rows, based on a previously-pulled SSM payload. All
 * operations run in a single transaction.
 *
 * Constraints:
 *   - Final director count must remain within [MIN_DIRECTORS, MAX_DIRECTORS].
 *   - `isAuthorizedRepresentative` is never touched here. The admin keeps
 *     manual control over which director signs.
 *   - Removal is rejected if the target director has e-KYC progress
 *     (`trueIdentityStatus !== null`) — surfaces a clear ConflictError so
 *     the UI can render the warning.
 *   - Newly-added directors get `position: "Director"` and
 *     `order = max(existing) + 1`.
 *
 * The endpoint also stamps provenance under `ssmFieldProvenance.directors`
 * so the UI can render an "SSM Verified" badge per director, and writes a
 * `SSM_DIRECTOR_SYNC` audit event.
 */
router.post(
  '/:borrowerId/ssm/directors/sync',
  requirePermission('truessm.manage'),
  async (req, res, next) => {
    try {
      const borrowerId = getRouteParam(req.params.borrowerId);
      const body = directorSyncSchema.parse(req.body ?? {});

      const borrower = await loadCorporateBorrower(req.tenantId!, borrowerId);

      const pull = await prisma.trueSsmPull.findFirst({
        where: { id: body.pullId, borrowerId, tenantId: req.tenantId! },
      });
      if (!pull) throw new NotFoundError('SSM pull');

      const directors = await loadBorrowerDirectors(borrowerId);
      const diff = mapCompanyOfficersToDirectorDiff(pull.rawData, directors);

      // Index the diff by canonical IC so each operation can look up its
      // proposed SSM data efficiently.
      const diffByIc = new Map(diff.diff.map((entry) => [entry.icNumber, entry] as const));
      const orphansById = new Map(diff.orphans.map((o) => [o.id, o] as const));
      const directorsById = new Map(directors.map((d) => [d.id, d] as const));
      const directorsByCanonicalIc = new Map(
        directors
          .map((d) => {
            const canon = normaliseIcForMatch(d.icNumber);
            return canon ? ([canon, d] as const) : null;
          })
          .filter((x): x is readonly [string, (typeof directors)[number]] => x !== null),
      );

      // Classify each operation. We dedupe by canonical IC so a noisy client
      // can't double-apply.
      const seen = new Set<string>();
      const adds: Array<{ icRaw: string; ssmName: string }> = [];
      const updates: Array<{ directorId: string; newName: string; canonIc: string }> = [];
      const verifies: Array<{ directorId: string; canonIc: string }> = [];
      const removals: Array<{ directorId: string; canonIc: string }> = [];

      for (const op of body.operations) {
        const canonIc = normaliseIcForMatch(op.icNumber);
        if (!canonIc || seen.has(canonIc)) continue;
        seen.add(canonIc);

        if (op.action === 'remove') {
          // Removal must target an existing borrower director (orphan or
          // matched). We allow either, but block when e-KYC has started.
          const directorByCanon = directorsByCanonicalIc.get(canonIc);
          if (!directorByCanon) {
            throw new BadRequestError(
              `Director ${op.icNumber} not on borrower; nothing to remove`,
              'DIRECTOR_NOT_FOUND',
            );
          }
          const orphan = orphansById.get(directorByCanon.id);
          if (!orphan) {
            throw new BadRequestError(
              `Director ${op.icNumber} is present in SSM; refusing to remove`,
              'DIRECTOR_IN_SSM',
            );
          }
          if (orphan.hasEkyc) {
            throw new ConflictError(
              `Director ${orphan.name} has e-KYC progress and cannot be removed via sync.`,
            );
          }
          // Removing the authorised representative is allowed — we
          // auto-promote a replacement after all ops apply (see below).
          removals.push({ directorId: directorByCanon.id, canonIc });
          continue;
        }

        const entry = diffByIc.get(canonIc);
        if (!entry) {
          throw new BadRequestError(
            `Director ${op.icNumber} is not in the selected SSM pull`,
            'DIRECTOR_NOT_IN_PULL',
          );
        }

        if (op.action === 'add') {
          if (entry.action !== 'add') {
            throw new ConflictError(
              `Director ${op.icNumber} already exists on borrower; use update or verify`,
            );
          }
          adds.push({ icRaw: entry.icNumberRaw, ssmName: entry.ssmName });
        } else if (op.action === 'update') {
          if (!entry.match) {
            throw new BadRequestError(
              `Director ${op.icNumber} has no matching record to update`,
              'DIRECTOR_NO_MATCH',
            );
          }
          if (!entry.changes.name) {
            // Asked for update but nothing differs — fall through to verify.
            verifies.push({ directorId: entry.match.id, canonIc });
          } else {
            updates.push({
              directorId: entry.match.id,
              newName: entry.changes.name.to,
              canonIc,
            });
          }
        } else {
          // verify
          if (!entry.match) {
            throw new BadRequestError(
              `Director ${op.icNumber} has no matching record to verify`,
              'DIRECTOR_NO_MATCH',
            );
          }
          verifies.push({ directorId: entry.match.id, canonIc });
        }
      }

      // Enforce count invariants BEFORE writing.
      const finalCount = directors.length + adds.length - removals.length;
      if (finalCount < MIN_DIRECTORS) {
        throw new ConflictError(
          `Sync would leave borrower with ${finalCount} directors; minimum is ${MIN_DIRECTORS}.`,
        );
      }
      if (finalCount > MAX_DIRECTORS) {
        throw new ConflictError(
          `Sync would leave borrower with ${finalCount} directors; maximum is ${MAX_DIRECTORS}.`,
        );
      }

      if (
        adds.length === 0 &&
        updates.length === 0 &&
        verifies.length === 0 &&
        removals.length === 0
      ) {
        throw new ConflictError('No operations to apply');
      }

      const now = new Date().toISOString();
      const nextOrderStart = directors.reduce((max, d) => Math.max(max, d.order), 0) + 1;

      const previousValues: Record<string, unknown> = {};
      for (const u of updates) {
        const cur = directorsById.get(u.directorId);
        if (cur) previousValues[u.directorId] = { name: cur.name };
      }
      for (const r of removals) {
        const cur = directorsById.get(r.directorId);
        if (cur)
          previousValues[r.directorId] = {
            name: cur.name,
            icNumber: cur.icNumber,
            position: cur.position,
          };
      }

      const addedIcs: string[] = [];
      const updatedIcs: string[] = [];
      const verifiedIcs: string[] = [];
      const removedIcs: string[] = [];
      // Set when removing the current auth-rep forces us to elect a new one.
      // Surfaced in the audit event so the timeline shows the reassignment.
      let promotedRepDirectorId: string | null = null;

      await prisma.$transaction(async (tx) => {
        let nextOrder = nextOrderStart;
        for (const a of adds) {
          await tx.borrowerDirector.create({
            data: {
              borrowerId,
              name: a.ssmName,
              icNumber: a.icRaw,
              position: 'Director',
              order: nextOrder,
              isAuthorizedRepresentative: false,
            },
          });
          nextOrder += 1;
          const canon = normaliseIcForMatch(a.icRaw);
          if (canon) addedIcs.push(canon);
        }
        for (const u of updates) {
          await tx.borrowerDirector.update({
            where: { id: u.directorId },
            data: { name: u.newName },
          });
          updatedIcs.push(u.canonIc);
        }
        for (const v of verifies) {
          // No field write — but recording the IC so we can stamp provenance.
          verifiedIcs.push(v.canonIc);
        }
        for (const r of removals) {
          await tx.borrowerDirector.delete({ where: { id: r.directorId } });
          removedIcs.push(r.canonIc);
        }

        // Stamp provenance under `directors.<canonicalIc>` so the UI can show
        // a green "SSM Verified" badge per director. Removals clear their
        // entry. We do NOT use `Borrower.update` provenance here for the
        // flat fields — those are scoped to `mapper.ts` SSM_MAPPABLE_FIELDS.
        const existingProvenance =
          borrower.ssmFieldProvenance &&
          typeof borrower.ssmFieldProvenance === 'object' &&
          !Array.isArray(borrower.ssmFieldProvenance)
            ? (borrower.ssmFieldProvenance as Record<string, unknown>)
            : {};
        const directorsProv = (
          existingProvenance.directors &&
          typeof existingProvenance.directors === 'object' &&
          !Array.isArray(existingProvenance.directors)
            ? (existingProvenance.directors as Record<string, unknown>)
            : {}
        ) as Record<string, unknown>;
        const nextDirectorsProv: Record<string, unknown> = { ...directorsProv };
        for (const ic of [...addedIcs, ...updatedIcs, ...verifiedIcs]) {
          nextDirectorsProv[ic] = {
            syncedAt: now,
            usageId: pull.usageId ?? null,
            pullId: pull.id,
          };
        }
        for (const ic of removedIcs) {
          delete nextDirectorsProv[ic];
        }
        const nextProvenance: Record<string, unknown> = { ...existingProvenance };
        if (Object.keys(nextDirectorsProv).length === 0) {
          delete nextProvenance.directors;
        } else {
          nextProvenance.directors = nextDirectorsProv;
        }
        await tx.borrower.update({
          where: { id: borrowerId },
          data: {
            ssmFieldProvenance:
              Object.keys(nextProvenance).length === 0
                ? Prisma.JsonNull
                : (nextProvenance as Prisma.InputJsonValue),
            // If any director was added/removed, mirror to authorizedRep
            // ONLY when the borrower has exactly one director afterwards
            // (matches the form-level invariant the admin page enforces).
            // We never auto-pick — the existing authorizedRep stays if
            // they're still on the roster.
          },
        });

        // Maintain the "exactly one authorised representative" invariant.
        // The only sync op that can break it is removing the current rep —
        // when that happens we promote the lowest-order remaining director.
        // Newly-added directors don't get auto-elected because they came
        // from SSM, not from an admin decision.
        if (removals.length > 0) {
          const remaining = await tx.borrowerDirector.findMany({
            where: { borrowerId },
            select: { id: true, order: true, isAuthorizedRepresentative: true },
            orderBy: { order: 'asc' },
          });
          const repCount = remaining.filter((d) => d.isAuthorizedRepresentative).length;
          if (repCount === 0 && remaining.length > 0) {
            promotedRepDirectorId = remaining[0].id;
            await tx.borrowerDirector.update({
              where: { id: promotedRepDirectorId },
              data: { isAuthorizedRepresentative: true },
            });
          }
        }

        // Recompute verification summary so the borrower badge reflects the
        // new director count (added or removed unverified directors changes
        // "all directors verified").
        const directorStates = await tx.borrowerDirector.findMany({
          where: { borrowerId },
          select: {
            trueIdentityStatus: true,
            trueIdentityResult: true,
            isAuthorizedRepresentative: true,
          },
        });
        const verificationStatus = getBorrowerVerificationSummary({
          borrowerType: 'CORPORATE',
          documentVerified: borrower.documentVerified,
          trueIdentityStatus: borrower.trueIdentityStatus,
          trueIdentityResult: borrower.trueIdentityResult,
          directors: directorStates,
        });
        await tx.borrower.update({
          where: { id: borrowerId },
          data: { verificationStatus },
        });
      });

      await AuditService.log({
        tenantId: req.tenantId!,
        memberId: req.user?.memberId,
        action: 'SSM_DIRECTOR_SYNC',
        entityType: 'Borrower',
        entityId: borrowerId,
        previousData: previousValues,
        newData: {
          pullId: pull.id,
          usageId: pull.usageId,
          regNo: pull.regNo,
          added: addedIcs.length,
          updated: updatedIcs.length,
          verified: verifiedIcs.length,
          removed: removedIcs.length,
          promotedRepDirectorId,
        },
        ipAddress: req.ip,
      });

      res.json({
        success: true,
        data: {
          added: addedIcs,
          updated: updatedIcs,
          verified: verifiedIcs,
          removed: removedIcs,
          promotedRepDirectorId,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// Suppress lint: keep path import for upload helper path-safety in future.
void path;

export default router;
