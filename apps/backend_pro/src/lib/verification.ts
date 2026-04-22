/**
 * Borrower verification status utilities.
 * Single source of truth: Borrower.verificationStatus (cached, updated by webhook).
 * This function computes the status when the cached value is null (backward compat).
 */

import { pickBestTruestackKycSession } from './truestackKycSessionPick.js';

export type BorrowerVerificationSummary = 'FULLY_VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED';

type CorporateBorrowerDirectorForSummary = {
  trueIdentityStatus: string | null;
  trueIdentityResult: string | null;
  isAuthorizedRepresentative?: boolean | null;
};

type CorporateBorrowerDirectorForSessionSummary = {
  id: string;
  isAuthorizedRepresentative?: boolean | null;
};

type CorporateBorrowerKycSessionForSummary = {
  directorId: string | null;
  status: string;
  result: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function getBorrowerVerificationSummary(borrower: {
  borrowerType: string;
  documentVerified: boolean;
  trueIdentityStatus: string | null;
  trueIdentityResult: string | null;
  directors?: CorporateBorrowerDirectorForSummary[];
}): BorrowerVerificationSummary {
  if (borrower.borrowerType === 'CORPORATE') {
    const directors = borrower.directors ?? [];
    const relevant =
      directors.some((d) => d.isAuthorizedRepresentative === true)
        ? directors.filter((d) => d.isAuthorizedRepresentative === true)
        : directors;
    const allDirectorsVerified =
      relevant.length > 0 &&
      relevant.every(
        (d) => d.trueIdentityStatus === 'completed' && d.trueIdentityResult === 'approved'
      );
    const anyDirectorVerified = relevant.some(
      (d) => d.trueIdentityStatus === 'completed' && d.trueIdentityResult === 'approved'
    );

    if (allDirectorsVerified) return 'FULLY_VERIFIED';
    if (anyDirectorVerified) return 'PARTIALLY_VERIFIED';
    return 'UNVERIFIED';
  }

  const isIndividualVerified =
    borrower.trueIdentityStatus === 'completed' && borrower.trueIdentityResult === 'approved';

  return isIndividualVerified || borrower.documentVerified ? 'FULLY_VERIFIED' : 'UNVERIFIED';
}

/**
 * Derive the corporate borrower cache fields from the latest TrueStack KYC session
 * for each relevant director. A newer retry must override an older approved row.
 */
export function getCorporateBorrowerVerificationFromLatestSessions(input: {
  directors: CorporateBorrowerDirectorForSessionSummary[];
  sessions: CorporateBorrowerKycSessionForSummary[];
}): {
  verificationStatus: BorrowerVerificationSummary;
  documentVerified: boolean;
} {
  const relevantDirectors =
    input.directors.some((director) => director.isAuthorizedRepresentative === true)
      ? input.directors.filter((director) => director.isAuthorizedRepresentative === true)
      : input.directors;

  const directorStates: CorporateBorrowerDirectorForSummary[] = relevantDirectors.map((director) => {
    const latestSession = pickBestTruestackKycSession(
      input.sessions.filter((session) => session.directorId === director.id)
    );
    return {
      trueIdentityStatus: latestSession?.status ?? null,
      trueIdentityResult: latestSession?.result ?? null,
      isAuthorizedRepresentative: director.isAuthorizedRepresentative ?? null,
    };
  });

  const verificationStatus = getBorrowerVerificationSummary({
    borrowerType: 'CORPORATE',
    documentVerified: false,
    trueIdentityStatus: null,
    trueIdentityResult: null,
    directors: directorStates,
  });

  const documentVerified =
    directorStates.length > 0 &&
    directorStates.every(
      (director) =>
        director.trueIdentityStatus === 'completed' &&
        director.trueIdentityResult === 'approved'
    );

  return {
    verificationStatus,
    documentVerified,
  };
}

/**
 * True when individual identity fields must not be edited.
 * Matches "fully verified" in {@link getBorrowerVerificationSummary} (TrueStack KYC
 * approved and/or `documentVerified`), same idea as admin disabling IC when verified.
 */
export function isIndividualIdentityLocked(borrower: {
  borrowerType: string;
  documentVerified: boolean;
  trueIdentityStatus: string | null;
  trueIdentityResult: string | null;
  directors?: Array<{
    trueIdentityStatus: string | null;
    trueIdentityResult: string | null;
  }>;
}): boolean {
  if (borrower.borrowerType !== 'INDIVIDUAL') return false;
  return getBorrowerVerificationSummary(borrower) === 'FULLY_VERIFIED';
}

/**
 * Server-side mirror of the borrower_pro client `isBorrowerKycComplete` helper.
 * Lets the loan-center overview endpoint return a single boolean so the borrower
 * UI doesn't need to fan out separate `/borrower` + `/kyc/status` calls just to
 * compute it on every page load.
 */
type KycSessionForCompletion = {
  directorId: string | null;
  status: string;
  result: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function isBorrowerKycComplete(
  borrower: {
    borrowerType: string;
    documentVerified: boolean;
    verificationStatus: string | null;
    trueIdentityStatus: string | null;
    trueIdentityResult: string | null;
    directors?: Array<{ id: string; isAuthorizedRepresentative?: boolean | null }>;
  },
  sessions: KycSessionForCompletion[]
): boolean {
  if (borrower.borrowerType === 'INDIVIDUAL') {
    // Strip `directors` when delegating — `isIndividualIdentityLocked` types its
    // directors as having TrueStack identity fields (used by other callers for
    // corporate paths), but the individual branch never reads them. Passing the
    // raw shape would fail typecheck for no behavioral reason.
    if (
      isIndividualIdentityLocked({
        borrowerType: borrower.borrowerType,
        documentVerified: borrower.documentVerified,
        trueIdentityStatus: borrower.trueIdentityStatus,
        trueIdentityResult: borrower.trueIdentityResult,
      })
    ) {
      return true;
    }
    const latest = pickBestTruestackKycSession(
      sessions.filter((s) => !s.directorId)
    );
    return latest?.status === 'completed' && latest.result === 'approved';
  }

  if (borrower.verificationStatus === 'FULLY_VERIFIED') return true;

  const directors = borrower.directors ?? [];
  const kycDirectors = directors.some((d) => d.isAuthorizedRepresentative === true)
    ? directors.filter((d) => d.isAuthorizedRepresentative === true)
    : directors.length > 0
      ? [directors[0]]
      : [];

  if (kycDirectors.length === 0) return false;

  return kycDirectors.every((director) => {
    const latest = pickBestTruestackKycSession(
      sessions.filter((s) => s.directorId === director.id)
    );
    return latest?.status === 'completed' && latest.result === 'approved';
  });
}
