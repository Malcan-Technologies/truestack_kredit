/**
 * Borrower verification status utilities.
 * Single source of truth: Borrower.verificationStatus (cached, updated by webhook).
 * This function computes the status when the cached value is null (backward compat).
 */

export type BorrowerVerificationSummary = 'FULLY_VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED';

export function getBorrowerVerificationSummary(borrower: {
  borrowerType: string;
  documentVerified: boolean;
  trueIdentityStatus: string | null;
  trueIdentityResult: string | null;
  directors?: Array<{
    trueIdentityStatus: string | null;
    trueIdentityResult: string | null;
    isAuthorizedRepresentative?: boolean | null;
  }>;
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
