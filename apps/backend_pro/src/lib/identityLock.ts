import type { Borrower, BorrowerDirector, PrismaClient } from '@prisma/client';
import { ForbiddenError } from './errors.js';
import { normalizeIdentityNumber } from './crossTenantLookupService.js';
import { getBorrowerVerificationSummary, isIndividualIdentityLocked } from './verification.js';

/** Individual: IC / passport / face uploads tied to e-KYC */
const LOCKED_INDIVIDUAL_DOC_CATEGORIES = new Set([
  'IC_FRONT',
  'IC_BACK',
  'SELFIE_LIVENESS',
  'PASSPORT',
]);

/** Corporate: director IC + liveness */
const LOCKED_CORPORATE_DOC_CATEGORIES = new Set([
  'DIRECTOR_IC_FRONT',
  'DIRECTOR_IC_BACK',
  'SELFIE_LIVENESS',
]);

export function isIdentityDocumentCategoryLockedType(
  borrowerType: string,
  category: string
): boolean {
  return borrowerType === 'CORPORATE'
    ? LOCKED_CORPORATE_DOC_CATEGORIES.has(category)
    : LOCKED_INDIVIDUAL_DOC_CATEGORIES.has(category);
}

type BorrowerWithDirectors = Borrower & {
  directors?: Pick<BorrowerDirector, 'trueIdentityStatus' | 'trueIdentityResult'>[];
};

async function hasCorporateIdentityDocsLocked(
  prisma: PrismaClient,
  borrower: BorrowerWithDirectors
): Promise<boolean> {
  const summary = getBorrowerVerificationSummary(borrower);
  if (summary === 'FULLY_VERIFIED') return true;

  const approvedSession = await prisma.truestackKycSession.findFirst({
    where: {
      borrowerId: borrower.id,
      directorId: { not: null },
      status: 'completed',
      result: 'approved',
    },
    select: { id: true },
  });
  return Boolean(approvedSession);
}

export async function assertIdentityDocumentMutationAllowed(
  prisma: PrismaClient,
  borrowerId: string,
  category: string
): Promise<void> {
  const borrower = await prisma.borrower.findUnique({
    where: { id: borrowerId },
    include: {
      directors: { select: { trueIdentityStatus: true, trueIdentityResult: true } },
    },
  });
  if (!borrower) return;

  if (!isIdentityDocumentCategoryLockedType(borrower.borrowerType, category)) return;

  if (borrower.borrowerType === 'INDIVIDUAL') {
    if (isIndividualIdentityLocked(borrower)) {
      throw new ForbiddenError(
        'Identity documents cannot be changed while you are verified. Start a new TrueStack KYC session to re-verify first.'
      );
    }
    return;
  }

  if (await hasCorporateIdentityDocsLocked(prisma, borrower)) {
    throw new ForbiddenError(
      'Director identity documents cannot be changed while verification is complete. Start a new TrueStack KYC session for that director to re-verify first.'
    );
  }
}

function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dateOfBirthMatches(existing: Date | null, incoming: string | undefined): boolean {
  if (incoming === undefined) return true;
  const t = incoming.trim();
  if (!t) return !existing;
  if (!existing) return false;
  const incomingDate = new Date(t);
  if (Number.isNaN(incomingDate.getTime())) return false;
  return formatDateOnly(existing) === formatDateOnly(incomingDate);
}

function genderMatches(existing: string | null, incoming: string | undefined): boolean {
  if (incoming === undefined) return true;
  const e = (existing ?? '').trim();
  const i = (incoming ?? '').trim();
  return e === i;
}

/**
 * Blocks edits to verified identity fields for individual borrowers.
 * Corporate director identity is edited via a different flow; not enforced here.
 */
export function assertNoLockedIndividualIdentityChanges(
  existing: Borrower,
  data: {
    name?: string;
    icNumber?: string;
    dateOfBirth?: string;
    gender?: string;
    documentType?: string;
  }
): void {
  if (existing.borrowerType !== 'INDIVIDUAL' || !isIndividualIdentityLocked(existing)) {
    return;
  }

  const msg =
    'Verified identity details (name, IC/passport number, date of birth, gender, document type) cannot be edited. Start a new TrueStack KYC session to re-verify if you need to change them.';

  if (data.name !== undefined && data.name.trim() !== existing.name.trim()) {
    throw new ForbiddenError(msg);
  }
  if (
    data.icNumber !== undefined &&
    normalizeIdentityNumber(data.icNumber) !== normalizeIdentityNumber(existing.icNumber)
  ) {
    throw new ForbiddenError(msg);
  }
  if (data.documentType !== undefined && data.documentType !== existing.documentType) {
    throw new ForbiddenError(msg);
  }
  if (!dateOfBirthMatches(existing.dateOfBirth, data.dateOfBirth)) {
    throw new ForbiddenError(msg);
  }
  if (!genderMatches(existing.gender, data.gender)) {
    throw new ForbiddenError(msg);
  }
}
